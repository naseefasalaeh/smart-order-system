import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('1. Member enrollment directly sets active=true without pending approval', () => {
  const routeSource = readFileSync('src/app/api/membership/route.ts', 'utf8');
  assert.ok(!routeSource.includes('state: "pending"'), 'API must not return pending state');
  assert.ok(routeSource.includes('state: "member"'), 'API must return member state');
  assert.ok(routeSource.includes('สมัครสมาชิกสำเร็จ ยินดีต้อนรับสู่ระบบสมาชิก Smart Order'), 'Success message on enroll');
});

test('2. OptionalMembership client component removed pending screen, checks, and buttons', () => {
  const compSource = readFileSync('src/components/optional-membership.tsx', 'utf8');
  assert.ok(!compSource.includes('STATE 2: PENDING APPROVAL'), 'Must remove pending approval screen');
  assert.ok(!compSource.includes('คำขอสมาชิกรอแอดมินยืนยัน'), 'Must remove pending banner text');
  assert.ok(!compSource.includes('ส่งคำขอสมัครสมาชิกแล้ว (รอแอดมินยืนยัน)'), 'Must remove pending status');
  assert.ok(!compSource.includes('ตรวจสถานะอีกครั้ง'), 'Must remove check status button');
  assert.ok(!compSource.includes('ยกเลิกคำขอ / เปลี่ยนเบอร์'), 'Must remove cancel pending request button');
});

test('3. Admin Members page has exactly 2 tabs (Directory and Analytics) and no pending tab', () => {
  const clientSource = readFileSync('src/app/dashboard/members/MembersClient.tsx', 'utf8');
  const pageSource = readFileSync('src/app/dashboard/members/page.tsx', 'utf8');

  // Must not have pending tab or pending action buttons
  assert.ok(!clientSource.includes('รออนุมัติสมาชิกใหม่'), 'Must remove pending approvals tab');
  assert.ok(!clientSource.includes('✓ อนุมัติสมาชิก'), 'Must remove approve button');
  assert.ok(!clientSource.includes('✕ ปฏิเสธ'), 'Must remove reject button');
  assert.ok(clientSource.includes('รายชื่อสมาชิกทั้งหมด'), 'Must retain Directory tab');
  assert.ok(clientSource.includes('Dashboard สถิติการตลาด'), 'Must retain Analytics tab');

  // Initial tab must default to directory
  assert.ok(clientSource.includes('useState<"directory" | "analytics">("directory")'), 'Must default to directory tab');

  // Server page must not query pending members
  assert.ok(!pageSource.includes('admin_list_pending_members'), 'Page must not query pending members');
});
