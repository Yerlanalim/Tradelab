import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './config.js';

const testServiceRole = async () => {
  console.log('\n=== Testing Service Role Key ===');
  console.log('URL:', SUPABASE_URL);
  console.log('Key (masked):', SUPABASE_SERVICE_ROLE_KEY.slice(0, 10) + '...' + SUPABASE_SERVICE_ROLE_KEY.slice(-10));
  console.log('Key length:', SUPABASE_SERVICE_ROLE_KEY.length);
  
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    // Test 1: Simple query
    console.log('\n--- Test 1: Query tc_packs ---');
    const { data: packs, error: packsError } = await client
      .from('tc_packs')
      .select('*')
      .limit(1);
    
    if (packsError) {
      console.error('❌ tc_packs query failed:', packsError);
    } else {
      console.log('✅ tc_packs query succeeded, rows:', packs?.length || 0);
    }

    // Test 2: RPC call
    console.log('\n--- Test 2: RPC tc_get_balance ---');
    const testUserId = '81a0435b-e05d-4419-ac73-2bb6a32c7978';
    const { data: balance, error: balanceError } = await client.rpc('tc_get_balance', {
      p_user_id: testUserId
    });
    
    if (balanceError) {
      console.error('❌ tc_get_balance failed:', balanceError);
    } else {
      console.log('✅ tc_get_balance succeeded:', balance);
    }

    // Test 3: Auth admin
    console.log('\n--- Test 3: Auth Admin API ---');
    const { data: users, error: usersError } = await client.auth.admin.listUsers({
      page: 1,
      perPage: 1
    });
    
    if (usersError) {
      console.error('❌ Auth admin failed:', usersError);
    } else {
      console.log('✅ Auth admin succeeded, users count:', users?.users?.length || 0);
    }

  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
  
  console.log('\n=== Test Complete ===\n');
};

testServiceRole();
