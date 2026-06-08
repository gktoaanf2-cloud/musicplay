// ============================================
// PAIR MUSIC BOX v3.0 — Supabase Config
// 모든 HTML 페이지에서 이 파일을 먼저 로드
// ============================================

const SUPABASE_URL = 'https://zrfasztpsmprfpslizac.supabase.co';
const SUPABASE_KEY = 'sb_publishable_z7m5HVzuiUhBzRKIAuOKZQ_y4PFw-6B';

const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 현재 로그인 유저 가져오기
async function getCurrentUser() {
    const { data: { user } } = await _supabase.auth.getUser();
    return user;
}

// 프로필 가져오기
async function getProfile(userId) {
    const { data } = await _supabase.from('profiles').select('*').eq('id', userId).single();
    return data;
}

// 로그인 상태 확인 → 비로그인이면 index.html로
async function requireAuth() {
    const user = await getCurrentUser();
    if (!user) { window.location.href = 'index.html'; return null; }
    return user;
}

// 이미 로그인 → dashboard로
async function redirectIfLoggedIn() {
    const user = await getCurrentUser();
    if (user) { window.location.href = 'dashboard.html'; }
}
