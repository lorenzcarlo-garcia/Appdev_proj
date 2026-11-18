import EmptyState from './EmptyState';
import LoadingSpinner from './LoadingSpinner';
export default function DataTable({ columns, rows, rowKey = 'id', caption, renderCard, loading = false, emptyTitle = 'No records found' }) {
  if (loading) return <LoadingSpinner />;
  if (!rows.length) return <EmptyState title={emptyTitle} />;
  return <><div className={renderCard ? 'hidden overflow-x-auto md:block' : 'overflow-x-auto'}><table className="ledger-table w-full text-left text-sm"><caption className="sr-only">{caption}</caption><thead className="text-muted"><tr>{columns.map(column => <th key={column.key} scope="col" className="px-4 py-3 font-semibold">{column.label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row[rowKey]} className="border-b border-line last:border-0">{columns.map(column => <td key={column.key} className="px-4 py-2.5 align-middle wrap-anywhere">{['reference_no','blotter_no'].includes(column.key) ? <span className="reference-stamp">{column.render ? column.render(row) : row[column.key]}</span> : column.render ? column.render(row) : row[column.key]}</td>)}</tr>)}</tbody></table></div>{renderCard && <ul aria-label={caption} className="record-list md:hidden">{rows.map(row => <li key={row[rowKey]} className="px-4 py-5">{renderCard(row)}</li>)}</ul>}</>;
}
