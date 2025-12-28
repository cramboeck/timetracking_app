/**
 * Test script to validate Clockodo API connection and response format
 *
 * Usage:
 *   npx ts-node scripts/test-clockodo-api.ts <email> <api-key>
 *
 * Example:
 *   npx ts-node scripts/test-clockodo-api.ts user@example.com abc123
 */

const CLOCKODO_API_URL = 'https://my.clockodo.com/api/v2';

interface TestResult {
  endpoint: string;
  success: boolean;
  status?: number;
  data?: any;
  error?: string;
}

async function clockodoFetch(
  apiEmail: string,
  apiKey: string,
  endpoint: string
): Promise<{ status: number; data: any }> {
  const url = `${CLOCKODO_API_URL}${endpoint}`;
  console.log(`\n📡 Calling: ${url}`);

  const response = await fetch(url, {
    headers: {
      'X-ClockodoApiUser': apiEmail,
      'X-ClockodoApiKey': apiKey,
      'X-Clockodo-External-Application': 'TimeTrackingApp;support@example.com',
      'Accept': 'application/json',
      'Accept-Charset': 'utf-8',
    },
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  return { status: response.status, data };
}

async function testEndpoint(
  apiEmail: string,
  apiKey: string,
  endpoint: string,
  description: string
): Promise<TestResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 Testing: ${description}`);

  try {
    const { status, data } = await clockodoFetch(apiEmail, apiKey, endpoint);

    if (status === 200) {
      console.log(`✅ Success (${status})`);
      console.log(`📦 Response keys:`, Object.keys(data));

      // Show sample data structure
      for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) {
          console.log(`   ${key}: Array with ${value.length} items`);
          if (value.length > 0) {
            console.log(`   Sample item keys:`, Object.keys(value[0]));
            console.log(`   First item:`, JSON.stringify(value[0], null, 2).substring(0, 500));
          }
        } else if (typeof value === 'object' && value !== null) {
          console.log(`   ${key}:`, JSON.stringify(value, null, 2).substring(0, 300));
        } else {
          console.log(`   ${key}:`, value);
        }
      }

      return { endpoint, success: true, status, data };
    } else {
      console.log(`❌ Failed (${status})`);
      console.log(`   Error:`, data);
      return { endpoint, success: false, status, error: JSON.stringify(data) };
    }
  } catch (error: any) {
    console.log(`❌ Exception: ${error.message}`);
    return { endpoint, success: false, error: error.message };
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║           Clockodo API Test Script                         ║
╠════════════════════════════════════════════════════════════╣
║  Usage:                                                    ║
║    npx ts-node scripts/test-clockodo-api.ts <email> <key>  ║
║                                                            ║
║  Find your API credentials at:                             ║
║    Clockodo → Einstellungen → API                          ║
╚════════════════════════════════════════════════════════════╝
`);
    process.exit(1);
  }

  const [apiEmail, apiKey] = args;

  console.log(`\n🚀 Clockodo API Test`);
  console.log(`   Email: ${apiEmail}`);
  console.log(`   API Key: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`);

  const results: TestResult[] = [];

  // Test 1: User/Authentication
  results.push(await testEndpoint(apiEmail, apiKey, '/user', 'User Authentication'));

  // Test 2: Customers
  results.push(await testEndpoint(apiEmail, apiKey, '/customers', 'Customers List'));

  // Test 3: Projects
  results.push(await testEndpoint(apiEmail, apiKey, '/projects', 'Projects List'));

  // Test 4: Services
  results.push(await testEndpoint(apiEmail, apiKey, '/services', 'Services List'));

  // Test 5: Time Entries (last 30 days)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const timeSince = thirtyDaysAgo.toISOString().split('T')[0] + ' 00:00:00';
  const timeUntil = now.toISOString().split('T')[0] + ' 23:59:59';

  results.push(await testEndpoint(
    apiEmail,
    apiKey,
    `/entries?time_since=${encodeURIComponent(timeSince)}&time_until=${encodeURIComponent(timeUntil)}&items_per_page=5`,
    `Time Entries (${timeSince} to ${timeUntil})`
  ));

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 SUMMARY`);
  console.log(`${'='.repeat(60)}`);

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`✅ Successful: ${successful}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);

  if (failed > 0) {
    console.log(`\n❌ Failed endpoints:`);
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.endpoint}: ${r.error}`);
    });
  }

  if (successful === results.length) {
    console.log(`\n🎉 All tests passed! The Clockodo API connection is working correctly.`);
  }
}

main().catch(console.error);
