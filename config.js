// Supabase 설정 파일
// 다음 값들을 본인의 Supabase 프로젝트 설정값으로 변경하세요

const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // https://xxxxx.supabase.co
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY'; // 공개 anon key

// Supabase 클라이언트 초기화
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
