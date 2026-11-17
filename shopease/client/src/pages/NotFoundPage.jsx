import {Link} from 'react-router-dom';
import EmptyState from '../components/ui/EmptyState';
export default function NotFoundPage() {
  return <main className="mx-auto max-w-xl p-5 pt-16"><EmptyState title="Page not found" action={<Link to="/" className="button button-primary">Go to my home</Link>}>Check the address or return to your home page.</EmptyState></main>;
}
