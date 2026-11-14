import { useState } from 'react';
import { post, put, del, qs } from './api.js';
import { useData, Page, Modal, Field, Empty, Loading, ErrorBox, run, confirmDo, ClassPicker } from './ui.jsx';

/**
 * Generic list + create/edit/delete page.
 *  endpoint: REST collection path · fields: form fields · columns: table columns
 *  canWrite: show editing controls · renderCard: card renderer (used for read-only feed views)
 *  filters: ['class','section'] etc. – shown as class picker for staff
 */
export default function CrudPage({ title, sub, endpoint, fields, columns, canWrite, renderCard, defaults = {}, classFilter, extraQuery = {},
  emptyText, newLabel = 'Add', toolbar, transformLoad = (x) => x, itemName = 'record' }) {
  const [filter, setFilter] = useState({});
  const [data, reload, { loading, error }] = useData(endpoint + qs({ ...(classFilter ? filter : {}), ...extraQuery }));
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const rows = data ? transformLoad(data) : [];

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    const body = { ...editing }; delete body.id;
    const ok = await run(() => editing.id ? put(`${endpoint}/${editing.id}`, body) : post(endpoint, body), editing.id ? 'Saved' : `${itemName[0].toUpperCase() + itemName.slice(1)} added`);
    setSaving(false);
    if (ok) { setEditing(null); reload(); }
  };
  const remove = async (r) => { if (confirmDo(`Delete this ${itemName}?`) && await run(() => del(`${endpoint}/${r.id}`), 'Deleted')) reload(); };

  return (<Page title={title} sub={sub} actions={<>{toolbar}{canWrite && <button className="btn" onClick={() => setEditing({ ...defaults, ...(classFilter && filter.class ? { class: filter.class, section: filter.section } : {}) })}>＋ {newLabel}</button>}</>}>
    {classFilter && canWrite && <div className="filters"><ClassPicker value={filter} onChange={setFilter} allowAll /></div>}
    <ErrorBox error={error} />
    {loading && !data ? <Loading /> : !rows.length ? <div className="card"><Empty>{emptyText}</Empty></div> :
      canWrite || !renderCard ? (
        <div className="card flush"><div className="table-wrap"><table>
          <thead><tr>{columns.map(c => <th key={c.key || c.label} className={c.num ? 'num' : ''}>{c.label}</th>)}{canWrite && <th />}</tr></thead>
          <tbody>{rows.map(r => <tr key={r.id}>
            {columns.map(c => <td key={c.key || c.label} className={c.num ? 'num' : ''}>{c.render ? c.render(r) : r[c.key] ?? '—'}</td>)}
            {canWrite && <td className="nowrap right">
              <button className="btn sm secondary" onClick={() => setEditing(r)}>Edit</button>{' '}
              <button className="btn sm ghost" onClick={() => remove(r)} aria-label="Delete">🗑</button></td>}
          </tr>)}</tbody>
        </table></div></div>
      ) : <div className="stack">{rows.map(r => <div key={r.id}>{renderCard(r)}</div>)}</div>}

    {editing && <Modal title={editing.id ? `Edit ${itemName}` : `${newLabel}`} onClose={() => setEditing(null)}
      footer={<><button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button><button className="btn" form="crud-form" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></>}>
      <form id="crud-form" className="form-grid" onSubmit={save}>
        {fields.map(f => <Field key={f.name} f={f} value={editing[f.name]} onChange={(k, v) => setEditing(p => ({ ...p, [k]: v }))} />)}
      </form>
    </Modal>}
  </Page>);
}
