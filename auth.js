/**
 * Harmoni — Gerenciamento de sessão (frontend)
 * Usa sessionStorage para manter o usuário logado.
 * API_URL aponta para /api (mesmo domínio na Vercel).
 */

const API_URL = '/api';

const HarmoniAuth = {

  // Salva o usuário após login
  login(userData) {
    sessionStorage.setItem('harmoni_user', JSON.stringify(userData));
  },

  // Remove a sessão (logout)
  logout() {
    sessionStorage.removeItem('harmoni_user');
    window.location.href = 'login.html';
  },

  // Retorna o usuário logado ou null
  getUser() {
    const data = sessionStorage.getItem('harmoni_user');
    return data ? JSON.parse(data) : null;
  },

  // Redireciona para login se não estiver autenticado
  // Chame no topo de todas as páginas protegidas
  requireAuth() {
    const user = this.getUser();
    if (!user) {
      window.location.href = 'login.html';
      return null;
    }
    return user;
  },

  // Preenche todos os elementos com data-user-name na página
  fillUserName() {
    const user = this.getUser();
    if (!user) return;
    document.querySelectorAll('[data-user-name]').forEach(el => {
      el.textContent = user.name || 'Colaborador';
    });
  },

  // Chama a API real de login
  async loginAPI(email, senha) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao fazer login');
    this.login({ ...data.user, token: data.token });
    return data.user;
  },

  // Retorna o token JWT salvo
  getToken() {
    const user = this.getUser();
    return user?.token || null;
  },

  // Faz fetch autenticado para a API
  async fetch(path, options = {}) {
    const token = this.getToken();
    return fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
  }
};
