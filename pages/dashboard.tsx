import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Dashboard() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to voorraad-opzoeken (main page for winkel)
    router.push('/voorraad-opzoeken');
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <p className="text-gray-600">Redirecting...</p>
    </div>
  );
}

