import { createServer } from 'node:http';

export const adminId = '00000000-0000-4000-8000-000000000091';
export const orderId = '00000000-0000-4000-8000-000000000001';
export async function startMock(port = 4401) {
  const state = { requests: [], role: 'admin', active: true, profileError: false, authError: false, failWrite: false, queryError: '', delay: 100, status: 'confirmed', updatedAt: new Date().toISOString() };
  const user = (id = adminId) => ({ id, email: 'admin@example.invalid', aud: 'authenticated', role: 'authenticated', created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} });
  const session = () => ({ access_token: `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: adminId, role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url')}.mock`, refresh_token: 'local-test-only', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, token_type: 'bearer', user: user() });
  const ingredient = { id: 1, name: 'TEST rice', unit: 'กรัม', stock_quantity: 100, minimum_stock: 5, category_id: 1, ingredient_categories: { id: 1, name: 'อื่น ๆ', display_order: 1 } };
  const menu = { id: 1, name: 'TEST menu', description: '', price: 50, category_id: 1, is_available: true, image_url: null, updated_at: new Date().toISOString() };
  const table = { id: 1, table_number: 'TEST 1', status: 'available' };
  const profiles = [{ id: adminId, full_name: 'TEST Admin', role: 'admin', is_active: true }, { id: '00000000-0000-4000-8000-000000000092', full_name: 'TEST Staff', role: 'staff', is_active: true }];
  const server = createServer(async (req, res) => {
    const start = performance.now();
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'content-range');
    if (req.method === 'OPTIONS') { res.end(); return; }
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    await new Promise(resolve => setTimeout(resolve, state.delay));
    let status = 200, data = null;
    const path = url.pathname;
    if (state.failWrite && !['GET', 'HEAD'].includes(req.method)) { status = 503; data = { message: 'test write unavailable', code: '08006' }; }
    else if (path === '/auth/v1/token') data = session();
    else if (path === '/auth/v1/user') { data = user(); if (state.authError) { status = 503; data = { message: 'test auth unavailable' }; } }
    else if (path === '/auth/v1/logout') data = {};
    else if (path === '/auth/v1/admin/users') data = req.method === 'GET' ? { users: profiles.map(p => user(p.id)), aud: 'authenticated', next_page: null, total: profiles.length } : user(profiles[1].id);
    else if (path.startsWith('/auth/v1/admin/users/')) data = user(path.split('/').at(-1));
    else if (path.startsWith('/rest/v1/rpc/')) {
      state.updatedAt = new Date().toISOString();
      if (path.endsWith('/advance_order_status')) state.status = body.p_next;
      if (path.endsWith('/serve_order')) { state.status = 'served'; state.servedAt = state.updatedAt; }
      if (path.endsWith('/complete_order_payment')) state.status = 'completed';
      if (path.endsWith('/cancel_order_and_restore_stock')) state.status = 'cancelled';
      if (path.endsWith('/manage_restaurant_table')) { table.table_number = body.p_number; table.status = body.p_active ? 'available' : 'inactive'; }
      data = 1;
    } else if (path.startsWith('/rest/v1/')) {
      const resource = path.split('/').at(-1);
      const order = { id: orderId, order_number: 1, dining_type: 'dine_in', status: state.status, total_amount: 50, created_at: state.updatedAt, updated_at: state.updatedAt, restaurant_tables: table, order_items: [{ id: 1, quantity: 1, unit_price: 50, subtotal: 50, menu_name_snapshot: menu.name, menus: { name: menu.name }, order_item_options: [] }] };
      order.dining_type = state.diningType || 'dine_in';
      order.served_at = state.servedAt || null;
      const all = { profiles, orders: [order], menus: [menu], ingredients: [ingredient], categories: [{ id: 1, name: 'TEST category' }], ingredient_categories: [{ id: 1, name: 'อื่น ๆ', display_order: 1, is_active: true }], restaurant_tables: [table], menu_ingredients: [{ id: 1, menu_id: 1, ingredient_id: 1, quantity_required: 1 }], payments: [], addons: [], menu_options: [], menu_option_groups: [], menu_option_ingredients: [] };
      data = all[resource] || [];
      if (url.searchParams.get('id') === 'eq.999') data = [];
      if (resource === 'profiles' && (url.searchParams.has('id') || req.headers.authorization !== 'Bearer local-fixture-service-key')) data = [{ ...profiles[0], role: state.role, is_active: state.active }];
      if (resource === 'orders' && url.searchParams.has('status')) {
        const filter = url.searchParams.get('status');
        if (!(filter === `eq.${state.status}` || filter.includes(state.status))) data = [];
      }
      if (req.method === 'PATCH') { Object.assign(data[0] || {}, body); }
      if (req.headers.accept?.includes('application/vnd.pgrst.object+json')) data = data[0] || null;
      if (resource === 'profiles' && state.profileError) { status = 503; data = { message: 'test profile unavailable', code: '08006' }; }
      if (resource === state.queryError) { status = 503; data = { message: 'test read unavailable', code: '08006' }; }
      res.setHeader('content-range', '0-0/1');
    } else { status = 404; data = { error: 'unhandled mock path' }; }
    if (state.failWrite && !['GET', 'HEAD'].includes(req.method)) { status = 503; data = { message: 'test write unavailable', code: '08006' }; }
    state.requests.push({ path, method: req.method, ms: Math.round(performance.now()-start), status, at: Date.now() });
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data));
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { state, session, close: () => new Promise(resolve => server.close(resolve)) };
}
