import { db } from './db.js';

/** Send an in-app notification to every active customer login of an organisation. Returns how many people got it. */
export function notifyClient(clientId, { title, body = null, filing_id = null, request_id = null, sender_id = null }) {
  const users = db.prepare("SELECT id FROM users WHERE client_id=? AND role='customer' AND active=1").all(clientId);
  const ins = db.prepare('INSERT INTO notifications (user_id,client_id,filing_id,request_id,title,body,sender_id) VALUES (?,?,?,?,?,?,?)');
  for (const u of users) ins.run(u.id, clientId, filing_id, request_id, title, body, sender_id);
  return users.length;
}
