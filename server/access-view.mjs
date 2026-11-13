import { canDecide, writable } from '../lib/domain.mjs';

const PAGE_SIZE = 50;
const field = value => String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ');
const line = values => values.map(field).join('\t');

export function accessResponse(data, requestUrl) {
  if (data.error) return line(['ERROR', data.error]);
  if (!data.state || !data.actor) return 'OK';
  const { state, actor } = data;
  const params = new URL(requestUrl, 'http://localhost').searchParams;
  const decidable = row => canDecide(actor,row);
  const records = state.supports.filter(row => params.get('view') !== 'inbox' || decidable(row));
  const pages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const requested = Number(params.get('page'));
  const page = Math.max(1,Math.min(pages,Number.isSafeInteger(requested) ? requested : 1));
  const departments = new Map(state.departments.map(dept => [dept.id,dept.name]));
  const people = new Map(state.people.map(person => [person.id,person.name]));
  const rows = [line(['M',data.revision,actor.name,actor.role,page,pages,records.length])];
  for (const dept of state.departments) rows.push(line(['D',dept.id,dept.name,writable(actor,dept.id)?1:0]));
  for (const person of state.people) {
    if (person.active && writable(actor,person.deptId)) rows.push(line(['P',person.id,person.deptId,person.name]));
  }
  for (const row of records.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE)) {
    rows.push(line(['R',row.id,row.code,departments.get(row.fromDept),departments.get(row.toDept),
      row.start,row.end,row.status,decidable(row)?1:0,row.note,row.reason,
      row.personIds.map(id=>people.get(id)??id).join(', '),row.realized?'1':'0',row.breakMinutes]));
  }
  return rows.join('\n');
}
