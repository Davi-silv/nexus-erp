import { getSupabaseClient } from '../../infrastructure/supabase.client.js';

export class SupabaseMembersRepository {
  #client = getSupabaseClient();

  async listMembers(companyId) {
    const { data, error } = await this.#client.rpc('list_company_members', {
      p_company_id: companyId
    });
    if (error) throw error;
    const rows = Array.isArray(data) ? data : (data || []);
    return rows.map(row => ({
      id: row.user_id,
      name: row.name || 'Membro',
      email: row.email || '',
      companyRole: row.role,
      role: row.role === 'owner' || row.role === 'admin' ? 'admin' : 'user'
    }));
  }

  async addMemberByEmail(companyId, email, role) {
    const { data, error } = await this.#client.rpc('add_company_member_by_email', {
      p_company_id: companyId,
      p_email: email,
      p_role: role
    });
    if (error) throw error;
    return data;
  }

  async setMemberRole(companyId, userId, role) {
    const { data, error } = await this.#client.rpc('set_company_member_role', {
      p_company_id: companyId,
      p_user_id: userId,
      p_role: role
    });
    if (error) throw error;
    return data;
  }

  async removeMember(companyId, userId) {
    const { data, error } = await this.#client.rpc('remove_company_member', {
      p_company_id: companyId,
      p_user_id: userId
    });
    if (error) throw error;
    return data;
  }
}

export const membersRepo = new SupabaseMembersRepository();
