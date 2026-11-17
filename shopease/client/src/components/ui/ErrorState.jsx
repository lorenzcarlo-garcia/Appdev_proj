import Alert from './Alert';
import Button from './Button';
export default function ErrorState({ message = 'Something went wrong. Please try again.', onRetry }) {
  return <div className="space-y-4"><Alert variant="error">{message}</Alert>{onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}</div>;
}
