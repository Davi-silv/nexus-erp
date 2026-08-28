import { getSupabaseClient } from '../../infrastructure/supabase.client.js';
import {
  buildUserFromSession,
  workspaceParamsFromRegister
} from '../../infrastructure/supabase/data-mapper.js';
import { getDefaultCategories } from '../../domain/profile.service.js';
import { uid } from '../../core/utils.js';

export class SupabaseAuthRepository {
  #client = getSupabaseClient();

  async getSession() {
    const { data: { session } } = await this.#client.auth.getSession();
    return session;
  }

  onAuthStateChange(callback) {
    return this.#client.auth.onAuthStateChange((_event, session) => callback(session));
  }

  async signIn(email, password) {
    const { data, error } = await this.#client.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, msg: translateAuthError(error.message) };
    let ctx = await this.#loadUserContext(data.user.id);

    if (!ctx.workspaceId) {
      const meta = data.user.user_metadata || {};
      const profileType = meta.profile_type || 'pf';
      const company = meta.company || null;
      const ws = workspaceParamsFromRegister(
        meta.full_name || data.user.email?.split('@')[0] || 'Workspace',
        profileType,
        company
      );
      const { data: workspaceId, error: wsError } = await this.#client.rpc('create_workspace_with_owner', {
        p_name: ws.name,
        p_type: ws.type,
        p_document: ws.document
      });
      if (wsError) return { ok: false, msg: wsError.message };
      await this.#seedDefaultCategories(workspaceId, profileType);
      ctx = await this.#loadUserContext(data.user.id);
    }

    return { ok: true, user: ctx.user, workspaceId: ctx.workspaceId };
  }

  async signUp(name, email, password, options = {}) {
    const { profileType = 'pf', company = null } = options;
    const { data, error } = await this.#client.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          profile_type: profileType,
          company
        }
      }
    });
    if (error) return { ok: false, msg: translateAuthError(error.message) };

    if (!data.session) {
      return {
        ok: true,
        needsEmailConfirmation: true,
        msg: 'Verifique seu e-mail para confirmar o cadastro.'
      };
    }

    const ws = workspaceParamsFromRegister(name, profileType, company);
    const { data: workspaceId, error: wsError } = await this.#client.rpc('create_workspace_with_owner', {
      p_name: ws.name,
      p_type: ws.type,
      p_document: ws.document
    });
    if (wsError) return { ok: false, msg: wsError.message };

    await this.#seedDefaultCategories(workspaceId, profileType);
    const ctx = await this.#loadUserContext(data.user.id);
    return { ok: true, user: ctx.user, workspaceId: ctx.workspaceId || workspaceId };
  }

  async signOut() {
    await this.#client.auth.signOut();
  }

  async loadUserContext(userId) {
    return this.#loadUserContext(userId);
  }

  async listWorkspaceMembers(workspaceId) {
    const { data, error } = await this.#client
      .from('workspace_members')
      .select('role, user_id, profiles(id, full_name)')
      .eq('workspace_id', workspaceId);
    if (error) throw error;

    const { data: { user: currentUser } } = await this.#client.auth.getUser();

    return (data || []).map(row => ({
      id: row.profiles?.id || row.user_id,
      name: row.profiles?.full_name || 'Membro',
      email: row.user_id === currentUser?.id ? (currentUser.email || '') : '',
      role: row.role === 'owner' || row.role === 'admin' ? 'admin' : 'user'
    }));
  }

  async updateWorkspaceProfile(workspaceId, userId, user) {
    const company = user.company;
    const wsPatch = {};

    if (company) {
      wsPatch.name = company.tradeName || company.legalName || user.name;
      wsPatch.document = company.cnpj || null;
      if (company.taxRegime === 'mei') wsPatch.type = 'mei';
      else if (user.profileType === 'pj') wsPatch.type = 'business';
    }

    if (Object.keys(wsPatch).length) {
      const { error } = await this.#client.from('workspaces').update(wsPatch).eq('id', workspaceId);
      if (error) throw error;
    }

    const { error: metaError } = await this.#client.auth.updateUser({
      data: {
        full_name: user.name,
        profile_type: user.profileType,
        company: user.company
      }
    });
    if (metaError) throw metaError;

    const { error: profileError } = await this.#client
      .from('profiles')
      .update({ full_name: user.name })
      .eq('id', userId);
    if (profileError) throw profileError;
  }

  async #loadUserContext(userId) {
    const { data: profile } = await this.#client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    const { data: memberships, error } = await this.#client
      .from('workspace_members')
      .select('role, workspace_id, workspaces(id, name, type, document)')
      .eq('user_id', userId)
      .limit(1);
    if (error) throw error;

    const membership = memberships?.[0];
    const workspace = membership?.workspaces;
    const { data: { user: authUser } } = await this.#client.auth.getUser();

    return {
      user: buildUserFromSession(authUser || { id: userId, email: '' }, profile, workspace, membership?.role),
      workspaceId: membership?.workspace_id || null,
      workspace
    };
  }

  async #seedDefaultCategories(workspaceId, profileType) {
    const categories = getDefaultCategories(profileType).map(c => ({
      id: uid(),
      workspace_id: workspaceId,
      name: c.name,
      color: c.color,
      type: c.name.toLowerCase().includes('receita') || c.name.toLowerCase().includes('vendas') ? 'income' : 'expense',
      active: true
    }));
    const { error } = await this.#client.from('categories').insert(categories);
    if (error) console.warn('[supabase] seed categories:', error.message);
  }
}

function translateAuthError(msg) {
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha inválidos';
  if (msg.includes('User already registered')) return 'E-mail já cadastrado';
  if (msg.includes('Email not confirmed')) return 'Confirme seu e-mail antes de entrar';
  return msg;
}

export const supabaseAuthRepo = new SupabaseAuthRepository();
