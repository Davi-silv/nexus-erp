import { hashPassword, uid } from '../core/utils.js';
import { DEFAULT_ADMIN, STORAGE_KEYS } from '../core/constants.js';
import { Events } from '../core/event-bus.js';
import { sessionStore } from '../infrastructure/storage.js';
import { usersRepo } from '../repositories/users.repository.js';
import { userDataRepo } from '../repositories/user-data.repository.js';
import { syncAccountBalances } from '../domain/finance.service.js';
import { PROFILE, getDefaultCategories } from '../domain/profile.service.js';
import { isSupabaseEnabled } from '../config/supabase.config.js';
import { supabaseAuthRepo } from '../repositories/supabase/auth.repository.js';
import { supabaseUserDataRepo } from '../repositories/supabase/user-data.repository.js';
import { hasLocalDataToMigrate, migrateLocalStorageToSupabase } from '../services/migration.service.js';
import { subscriptionService } from '../services/subscription.service.js';

/**
 * Store central — Single Source of Truth (padrão Flux unidirecional).
 * Modo local: localStorage. Modo cloud: Supabase Auth + PostgreSQL.
 */
export class AppStore {
  constructor(eventBus) {
    this.bus = eventBus;
    this.users = [];
    this.currentUserId = null;
    this.currentUserData = null;
    this.workspaceId = null;
    this.cloudMode = isSupabaseEnabled;
    this._sessionUser = null;
    this._saveTimer = null;
    this._saving = false;
    this._savePending = false;
    this._lastSaveSilent = false;
    this.subscription = subscriptionService;
  }

  async #loadSubscription() {
    if (this.workspaceId) {
      await this.subscription.load(this.workspaceId);
    }
  }

  async init() {
    if (this.cloudMode) {
      await this.#initCloud();
      return;
    }
    await this.#initLocal();
  }

  async #initLocal() {
    this.users = usersRepo.load();
    if (this.users.length === 0) {
      const pwHash = await hashPassword(DEFAULT_ADMIN.password);
      this.users.push({
        id: DEFAULT_ADMIN.id,
        name: DEFAULT_ADMIN.name,
        email: DEFAULT_ADMIN.email,
        role: DEFAULT_ADMIN.role,
        passwordHash: pwHash,
        profileType: PROFILE.PJ,
        company: {
          legalName: 'Nexus Tecnologia Ltda',
          tradeName: 'Nexus ERP',
          cnpj: '00.000.000/0001-00',
          taxRegime: 'simples'
        }
      });
      usersRepo.save(this.users);
    }

    const sessionId = sessionStore.getString(STORAGE_KEYS.SESSION);
    if (sessionId) {
      this.currentUserId = parseSessionId(sessionId);
      await this.loadUserData();
    }
  }

  async #initCloud() {
    const session = await supabaseAuthRepo.getSession();
    if (session?.user) {
      await this.#applyCloudSession(session.user.id);
    }
  }

  async #applyCloudSession(userId) {
    const ctx = await supabaseAuthRepo.loadUserContext(userId);
    this.currentUserId = userId;
    this._sessionUser = ctx.user;
    this.workspaceId = ctx.workspaceId || sessionStore.getString(STORAGE_KEYS.WORKSPACE);

    if (!this.workspaceId && ctx.workspaceId) {
      this.workspaceId = ctx.workspaceId;
      sessionStore.setString(STORAGE_KEYS.WORKSPACE, this.workspaceId);
    }

    sessionStore.setString(STORAGE_KEYS.SESSION, String(userId));
    await this.#maybeMigrateLocalData(ctx.user);
    await this.loadUserData();
    await this.#loadSubscription();

    try {
      this.users = this.workspaceId
        ? await supabaseAuthRepo.listWorkspaceMembers(this.workspaceId)
        : [ctx.user];
    } catch {
      this.users = [ctx.user];
    }

    this.bus.emit(Events.AUTH_CHANGED, { user: ctx.user });
  }

  async #maybeMigrateLocalData(user) {
    if (!hasLocalDataToMigrate()) return;
    const mig = await migrateLocalStorageToSupabase(user, this.workspaceId);
    if (mig.migrated) console.info('[nexus] Dados locais migrados para Supabase');
    if (!mig.ok && mig.msg) console.warn('[nexus] Migração:', mig.msg);
  }

  currentUser() {
    if (this.cloudMode) return this._sessionUser;
    return usersRepo.findById(this.currentUserId, this.users);
  }

  isAuthenticated() {
    return !!this.currentUserId;
  }

  isCloudMode() {
    return this.cloudMode;
  }

  async loadUserData() {
    if (!this.currentUserId) return;

    if (this.cloudMode) {
      this.currentUserData = await supabaseUserDataRepo.load(this.workspaceId);
    } else {
      this.currentUserData = userDataRepo.load(this.currentUserId);
    }

    if (!this.currentUserData.costCenters) this.currentUserData.costCenters = [];
    const u = this.currentUser();
    if (u && !u.profileType) u.profileType = PROFILE.PF;
    this.#syncBalances();
  }

  saveUserData({ silent = false } = {}) {
    if (!this.currentUserId || !this.currentUserData) return;

    this.#syncBalances();

    if (this.cloudMode) {
      this.#scheduleCloudSave(silent);
      return;
    }

    userDataRepo.save(this.currentUserId, this.currentUserData);
    if (!silent) this.bus.emit(Events.DATA_CHANGED);
  }

  #scheduleCloudSave(silent) {
    this._lastSaveSilent = silent;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.#flushCloudSave(), 400);
  }

  async #flushCloudSave() {
    if (this._saving) {
      this._savePending = true;
      return;
    }
    if (!this.workspaceId) {
      console.error('[nexus] workspaceId ausente — dados não salvos no cloud');
      return;
    }

    const silent = this._lastSaveSilent;
    const snapshot = this.currentUserData;
    this._saving = true;

    try {
      await supabaseUserDataRepo.save(this.workspaceId, snapshot, this.currentUserId);
      const fresh = await supabaseUserDataRepo.load(this.workspaceId);
      if (fresh && this.currentUserData === snapshot) {
        this.currentUserData = fresh;
        this.#syncBalances();
      }
      if (!silent) this.bus.emit(Events.DATA_CHANGED);
    } catch (err) {
      console.error('[nexus] Erro ao salvar no Supabase:', err.message);
    } finally {
      this._saving = false;
      if (this._savePending) {
        this._savePending = false;
        await this.#flushCloudSave();
      }
    }
  }

  #syncBalances() {
    if (!this.currentUserData) return;
    this.currentUserData.accounts = syncAccountBalances(
      this.currentUserData.accounts,
      this.currentUserData.txs
    );
  }

  async login(email, pass) {
    if (this.cloudMode) {
      const r = await supabaseAuthRepo.signIn(email, pass);
      if (!r.ok) return r;
      this.currentUserId = r.user.id;
      this._sessionUser = r.user;
      this.workspaceId = r.workspaceId;
      sessionStore.setString(STORAGE_KEYS.SESSION, String(r.user.id));
      if (r.workspaceId) sessionStore.setString(STORAGE_KEYS.WORKSPACE, r.workspaceId);
      await this.#maybeMigrateLocalData(r.user);
      await this.loadUserData();
      await this.#loadSubscription();
      this.users = r.workspaceId
        ? await supabaseAuthRepo.listWorkspaceMembers(r.workspaceId)
        : [r.user];
      this.bus.emit(Events.AUTH_CHANGED, { user: r.user });
      return { ok: true };
    }

    const user = usersRepo.findByEmail(email, this.users);
    if (!user) return { ok: false, msg: 'Usuário não encontrado' };
    const h = await hashPassword(pass);
    if (h !== user.passwordHash) return { ok: false, msg: 'Senha inválida' };
    this.currentUserId = user.id;
    sessionStore.setString(STORAGE_KEYS.SESSION, String(user.id));
    await this.loadUserData();
    this.bus.emit(Events.AUTH_CHANGED, { user });
    return { ok: true };
  }

  async register(name, email, pass, options = {}) {
    if (this.cloudMode) {
      const r = await supabaseAuthRepo.signUp(name, email, pass, options);
      if (!r.ok) return r;
      if (r.needsEmailConfirmation) return { ok: true, msg: r.msg, needsEmailConfirmation: true };
      this.currentUserId = r.user.id;
      this._sessionUser = r.user;
      this.workspaceId = r.workspaceId;
      sessionStore.setString(STORAGE_KEYS.SESSION, String(r.user.id));
      if (r.workspaceId) sessionStore.setString(STORAGE_KEYS.WORKSPACE, r.workspaceId);
      await this.#maybeMigrateLocalData(r.user);
      await this.loadUserData();
      await this.#loadSubscription();
      this.users = [r.user];
      this.bus.emit(Events.AUTH_CHANGED, { user: r.user });
      return { ok: true, user: r.user, autoLogin: true };
    }

    const { role = 'user', profileType = PROFILE.PF, company = null } = options;
    if (usersRepo.findByEmail(email, this.users)) {
      return { ok: false, msg: 'Email já cadastrado' };
    }
    const ph = await hashPassword(pass);
    const u = {
      id: uid(),
      name,
      email,
      role,
      passwordHash: ph,
      profileType,
      company: profileType === PROFILE.PJ ? (company || {}) : null
    };
    this.users.push(u);
    usersRepo.save(this.users);

    const data = userDataRepo.createEmpty(u.id);
    data.categories = getDefaultCategories(profileType).map(c => ({ id: uid(), ...c }));
    userDataRepo.save(u.id, data);

    return { ok: true, user: u };
  }

  async updateUserProfile(updates) {
    const u = this.currentUser();
    if (!u) return;
    Object.assign(u, updates);

    if (this.cloudMode && this.workspaceId) {
      try {
        await supabaseAuthRepo.updateWorkspaceProfile(this.workspaceId, this.currentUserId, u);
      } catch (err) {
        console.error('[nexus] Erro ao salvar perfil:', err.message);
      }
    } else {
      usersRepo.save(this.users);
    }

    this.bus.emit(Events.AUTH_CHANGED, { user: u });
  }

  async logout() {
    if (this.cloudMode) await supabaseAuthRepo.signOut();
    sessionStore.remove(STORAGE_KEYS.SESSION);
    sessionStore.remove(STORAGE_KEYS.WORKSPACE);
    this.currentUserId = null;
    this.currentUserData = null;
    this.workspaceId = null;
    this._sessionUser = null;
    this.bus.emit(Events.AUTH_CHANGED, { user: null });
  }

  deleteUser(id) {
    if (this.cloudMode) {
      console.warn('[nexus] Remoção de membros via UI ainda não disponível no modo cloud');
      return;
    }
    this.users = this.users.filter(u => u.id !== id);
    usersRepo.save(this.users);
    if (id === this.currentUserId) this.logout();
  }

  mutate(fn) {
    if (!this.currentUserData) return { ok: false };
    if (this.cloudMode && !this.subscription.canWrite()) {
      return { ok: false, reason: 'subscription_inactive' };
    }
    fn(this.currentUserData);
    this.saveUserData();
    return { ok: true };
  }

  bindCloudAuthListener() {
    if (!this.cloudMode) return;
    supabaseAuthRepo.onAuthStateChange(async (session) => {
      if (session?.user && session.user.id !== this.currentUserId) {
        await this.#applyCloudSession(session.user.id);
      } else if (!session && this.currentUserId) {
        this.currentUserId = null;
        this.currentUserData = null;
        this.workspaceId = null;
        this._sessionUser = null;
        sessionStore.remove(STORAGE_KEYS.SESSION);
        sessionStore.remove(STORAGE_KEYS.WORKSPACE);
        this.bus.emit(Events.AUTH_CHANGED, { user: null });
      }
    });
  }
}

function parseSessionId(raw) {
  const n = Number(raw);
  if (!Number.isNaN(n) && String(n) === raw) return n;
  return raw;
}
