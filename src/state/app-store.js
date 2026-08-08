import { hashPassword, uid } from '../core/utils.js';
import { DEFAULT_ADMIN, STORAGE_KEYS } from '../core/constants.js';
import { Events } from '../core/event-bus.js';
import { sessionStore } from '../infrastructure/storage.js';
import { usersRepo } from '../repositories/users.repository.js';
import { userDataRepo } from '../repositories/user-data.repository.js';
import { syncAccountBalances } from '../domain/finance.service.js';
import { PROFILE, getDefaultCategories } from '../domain/profile.service.js';

/**
 * Store central — Single Source of Truth (padrão Flux unidirecional).
 * Repositórios para persistência; EventBus para notificações.
 */
export class AppStore {
  constructor(eventBus) {
    this.bus = eventBus;
    this.users = [];
    this.currentUserId = null;
    this.currentUserData = null;
  }

  async init() {
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
      this.currentUserId = Number(sessionId);
      this.loadUserData();
    }
  }

  currentUser() {
    return usersRepo.findById(this.currentUserId, this.users);
  }

  isAuthenticated() {
    return !!this.currentUserId;
  }

  loadUserData() {
    if (!this.currentUserId) return;
    this.currentUserData = userDataRepo.load(this.currentUserId);
    if (!this.currentUserData.costCenters) this.currentUserData.costCenters = [];
    const u = this.currentUser();
    if (u && !u.profileType) u.profileType = PROFILE.PF;
    this.#syncBalances();
  }

  saveUserData({ silent = false } = {}) {
    if (!this.currentUserId || !this.currentUserData) return;
    this.#syncBalances();
    userDataRepo.save(this.currentUserId, this.currentUserData);
    if (!silent) this.bus.emit(Events.DATA_CHANGED);
  }

  #syncBalances() {
    if (!this.currentUserData) return;
    this.currentUserData.accounts = syncAccountBalances(
      this.currentUserData.accounts,
      this.currentUserData.txs
    );
  }

  async login(email, pass) {
    const user = usersRepo.findByEmail(email, this.users);
    if (!user) return { ok: false, msg: 'Usuário não encontrado' };
    const h = await hashPassword(pass);
    if (h !== user.passwordHash) return { ok: false, msg: 'Senha inválida' };
    this.currentUserId = user.id;
    sessionStore.setString(STORAGE_KEYS.SESSION, String(user.id));
    this.loadUserData();
    this.bus.emit(Events.AUTH_CHANGED, { user });
    return { ok: true };
  }

  async register(name, email, pass, options = {}) {
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

  updateUserProfile(updates) {
    const u = this.currentUser();
    if (!u) return;
    Object.assign(u, updates);
    usersRepo.save(this.users);
    this.bus.emit(Events.AUTH_CHANGED, { user: u });
  }

  logout() {
    sessionStore.remove(STORAGE_KEYS.SESSION);
    this.currentUserId = null;
    this.currentUserData = null;
    this.bus.emit(Events.AUTH_CHANGED, { user: null });
  }

  deleteUser(id) {
    this.users = this.users.filter(u => u.id !== id);
    usersRepo.save(this.users);
    if (id === this.currentUserId) this.logout();
  }

  mutate(fn) {
    if (!this.currentUserData) return;
    fn(this.currentUserData);
    this.saveUserData();
  }
}
