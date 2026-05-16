
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUser() {
  const email = 'rubenfiverr612@gmail.com';
  console.log(`Checking user: ${email} in ${supabaseUrl}`);

  // Find user by email
  const { data: { users }, error: userErr } = await supabase.auth.admin.listUsers();
  if (userErr) {
    console.error('Error listing users:', userErr);
    return;
  }

  const user = users.find(u => u.email === email);
  if (!user) {
    console.log('User not found in auth.users');
    return;
  }

  console.log('User found in auth.users:', { id: user.id, email: user.email });

  // Check profile
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (profErr) {
    console.error('Error fetching profile:', profErr);
  } else {
    console.log('Profile found:', profile);
  }

  // Check library
  const { count, error: libErr } = await supabase
    .from('library_items')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (libErr) {
    console.error('Error counting library items:', libErr);
  } else {
    console.log('Library items count:', count);
  }
}

checkUser();
