import { createClient } from '@supabase/supabase-js';

const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('Thiếu Project URL hoặc Publishable key trong .env.local. Không gửi secret key vào chat.');
  process.exit(1);
}
try {
  const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await supabase.rpc('app_connection_status');
  if(error){
    console.error('Chưa xác nhận được kết nối. Kiểm tra URL/key và đã chạy SQL 004 hoặc bootstrap chưa.');
    console.error('Mã lỗi:',error.code??'network-or-auth');
    process.exitCode=1;
  }else if(data?.application!=='elden-media'){
    console.error('Phản hồi không đúng project Elden Media.');process.exitCode=1;
  }else{
    console.log('Kết nối Supabase thành công. Schema:',data.schema_version);
    console.log('Đây là kiểm tra kết nối, không xác nhận Google login hoặc nghiệp vụ đã hoàn thiện.');
  }
}catch{
  console.error('Không kết nối được. Kiểm tra cấu hình .env.local và mạng; không cần in khóa để chẩn đoán.');
  process.exitCode=1;
}
