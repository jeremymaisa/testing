import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://napznboghhxmlnqlhynq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hcHpuYm9naGh4bWxucWxoeW5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NDMwMDgsImV4cCI6MjA4NjExOTAwOH0.6lKyS3d5e8X2KxE2MCGTC9ZG5Md7zi3c6fFdeV4v9DI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function getFileUrl(bucket, path) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
