import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';

export default function CadeaubonAanmakenPage() {
  const { isLoading } = useAuth();
  const [voucherAmount, setVoucherAmount] = useState('');
  const [voucherExpiry, setVoucherExpiry] = useState('');
  const [creatingVoucher, setCreatingVoucher] = useState(false);

  // Set default expiry date to 1 year from today
  useEffect(() => {
    const today = new Date();
    const oneYearLater = new Date(today);
    oneYearLater.setFullYear(today.getFullYear() + 1);
    const defaultExpiry = oneYearLater.toISOString().split('T')[0];
    setVoucherExpiry(defaultExpiry);
  }, []);

  const handleCreateVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const amount = parseFloat(voucherAmount);
    if (!amount || amount <= 0) {
      alert('Voer een geldig bedrag in');
      return;
    }

    setCreatingVoucher(true);
    try {
      const res = await fetch('/api/create-gift-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          customerId: null,
          customerName: null,
          email: null,
          expiryDate: voucherExpiry || null,
        }),
      });
      
      const json = await res.json();
      
      if (json.success && json.voucher) {
        const voucher = json.voucher;
        const code = voucher.code;
        const points = voucher.points || amount;
        
        // Ask if user wants to print label
        const printLabel = confirm(
          `✅ Cadeaubon aangemaakt!\n\n📋 Code: ${code}\n💰 Waarde: €${points}\n${voucher.expiration_date ? `📅 Geldig tot: ${new Date(voucher.expiration_date).toLocaleDateString('nl-BE')}\n` : ''}\n\n🖨️ Wil je een label printen voor de Dymo printer?`
        );
        
        if (printLabel) {
          const labelWindow = window.open('', '_blank', 'width=400,height=300');
          if (labelWindow) {
            fetch('/api/print-voucher-label', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                voucherCode: code,
                voucherId: voucher.id 
              }),
            })
            .then(r => r.text())
            .then(html => {
              labelWindow.document.write(html);
              labelWindow.document.close();
              setTimeout(() => {
                labelWindow.print();
              }, 500);
            })
            .catch(err => {
              console.error('Error loading label:', err);
              labelWindow.close();
              alert('Fout bij laden van label');
            });
          }
        } else {
          navigator.clipboard.writeText(code).then(() => {
            console.log('✅ Code copied to clipboard:', code);
          });
        }
        
        // Reset form (keep expiry date default)
        const today = new Date();
        const oneYearLater = new Date(today);
        oneYearLater.setFullYear(today.getFullYear() + 1);
        const defaultExpiry = oneYearLater.toISOString().split('T')[0];
        
        setVoucherAmount('');
        setVoucherExpiry(defaultExpiry);
      } else {
        alert(`❌ Error: ${json.error || 'Kon cadeaubon niet aanmaken'}`);
      }
    } catch (err) {
      console.error('Error creating voucher:', err);
      alert('Fout bij aanmaken van cadeaubon');
    } finally {
      setCreatingVoucher(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100">
        <div className="p-8 text-center">
          <p className="text-xl text-gray-600">Laden...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 font-sans">
      
      <div className="p-4 sm:p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              🎁 Cadeaubon Aanmaken
            </h1>
            <p className="text-gray-600 mt-2">
              Maak snel een nieuwe cadeaubon aan
            </p>
          </div>

          {/* Voucher Form */}
          <div className="bg-white shadow-xl rounded-2xl p-6">
            <form onSubmit={handleCreateVoucher} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bedrag (€) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={voucherAmount}
                  onChange={(e) => setVoucherAmount(e.target.value)}
                  placeholder="50.00"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg"
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={creatingVoucher}
                className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
              >
                {creatingVoucher ? '⏳ Aanmaken...' : '🎁 Maak Cadeaubon'}
              </button>
              
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <p className="text-sm text-purple-800">
                  💡 <strong>Standaard instellingen:</strong> Geen klant (anoniem), Geldig tot: {new Date(voucherExpiry).toLocaleDateString('nl-BE')}
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

