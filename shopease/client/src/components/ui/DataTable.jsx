import EmptyState from './EmptyState';
import LoadingSpinner from './LoadingSpinner';
export default function DataTable({ columns, rows, rowKey = 'id', caption, renderCard, loading = false, emptyTitle = 'No records found' }) {
  if (loading) return <LoadingSpinner />;
  if (!rows.length) return <EmptyState title={emptyTitle} />;
  return <><div className={renderCard ? 'hidden md:block' : 'overflow-x-auto'}><table className="w-full text-left text-sm"><caption className="sr-only">{caption}</caption><thead className="border-b border-line bg-canvas text-muted"><tr>{columns.map(column => <th key={column.key} scope="col" className="px-4 py-3 font-semibold">{column.label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row[rowKey]} className="border-b border-line last:border-0">{columns.map(column => <td key={column.key} className="px-4 py-4 align-top wrap-anywhere">{column.render ? column.render(row) : row[column.key]}</td>)}</tr>)}</tbody></table></div>{renderCard && <ul aria-label={caption} className="space-y-3 md:hidden">{rows.map(row => <li key={row[rowKey]} className="panel p-4">{renderCard(row)}</li>)}</ul>}</>;
}
