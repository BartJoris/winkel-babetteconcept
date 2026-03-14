import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';

interface TaxDetail {
  id: number;
  name: string;
  amount: number;
}

interface Product {
  id: number;
  name: string;
  display_name: string;
  active: boolean;
  sale_ok: boolean;
  taxes_id: number[];
  taxes_detail: TaxDetail[];
  has_tax: boolean;
  list_price: number;
  type: string;
  linked_to_program: boolean;
  product_tmpl_id: [number, string] | false;
}

interface Program {
  id: number;
  name: string;
  program_type: string;
  active: boolean;
  card_counts: { total: number; with_balance: number };
  [key: string]: any;
}

interface DebugData {
  programs: Program[];
  products: Product[];
  program_product_fields: string[];
  odoo_url: string;
}

type Recommendation = 'keep' | 'archive' | 'fix' | 'review';

function hasRealTax(p: Product): boolean {
  return p.taxes_detail.some(t => t.amount > 0);
}

function getRecommendation(p: Product, linkedIds: Set<number>, mainProgramProductIds: Set<number>): { rec: Recommendation; reason: string } {
  if (mainProgramProductIds.has(p.id)) {
    if (hasRealTax(p)) return { rec: 'fix', reason: 'Gekoppeld aan hoofdprogramma — BTW verwijderen!' };
    return { rec: 'keep', reason: 'Gekoppeld aan hoofdprogramma "Cadeaubonnen"' };
  }
  if (linkedIds.has(p.id)) {
    if (hasRealTax(p)) return { rec: 'fix', reason: 'Gekoppeld aan programma — BTW verwijderen!' };
    return { rec: 'keep', reason: 'Gekoppeld aan ander gift card programma' };
  }
  if (!p.active) return { rec: 'archive', reason: 'Al gearchiveerd' };
  const isGiftName = ['gift card', 'cadeaubon', 'geschenkbon'].some(n => p.name.toLowerCase().includes(n));
  if (isGiftName && p.active && !p.linked_to_program && p.sale_ok) {
    return { rec: 'review', reason: 'Actief & verkoopbaar maar niet gekoppeld aan programma — uit POS halen als niet meer nodig' };
  }
  if (isGiftName && hasRealTax(p)) {
    return { rec: 'archive', reason: 'Niet gekoppeld aan programma, heeft BTW — verwarrend' };
  }
  if (!p.sale_ok && !p.linked_to_program) {
    return { rec: 'archive', reason: 'Niet verkoopbaar, niet gekoppeld aan programma' };
  }
  if (p.sale_ok && !p.linked_to_program) {
    return { rec: 'review', reason: 'Verkoopbaar maar niet gekoppeld — nakijken of nog nodig' };
  }
  return { rec: 'review', reason: 'Nakijken' };
}

const recStyles: Record<Recommendation, { bg: string; text: string; label: string }> = {
  keep: { bg: 'bg-green-100', text: 'text-green-800', label: 'Behouden' },
  archive: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Archiveren' },
  fix: { bg: 'bg-red-100', text: 'text-red-800', label: 'Fixen!' },
  review: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Nakijken' },
};

export default function DebugGiftCardsPage() {
  const { isLoading } = useAuth();
  const [data, setData] = useState<DebugData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/debug-gift-cards')
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Fout bij ophalen');
        setData(json);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <p className="text-xl text-gray-600">Laden...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="bg-red-50 border border-red-300 rounded-lg p-4">
          <p className="text-red-800 font-semibold">Fout: {error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // The main program used by the winkel app
  const mainProgram = data.programs.find(p => p.name === 'Cadeaubonnen') || data.programs[0];

  // Collect all product IDs linked to any program
  const allLinkedIds = new Set<number>();
  const mainProgramProductIds = new Set<number>();
  for (const prog of data.programs) {
    for (const field of data.program_product_fields) {
      const val = prog[field];
      if (Array.isArray(val)) {
        for (const v of val) {
          if (typeof v === 'number') {
            allLinkedIds.add(v);
            if (mainProgram && prog.id === mainProgram.id) mainProgramProductIds.add(v);
          }
        }
      }
    }
  }

  const productsWithRec = data.products.map(p => ({
    ...p,
    ...getRecommendation(p, allLinkedIds, mainProgramProductIds),
  }));

  const toFix = productsWithRec.filter(p => p.rec === 'fix');
  const toKeep = productsWithRec.filter(p => p.rec === 'keep');
  const toArchive = productsWithRec.filter(p => p.rec === 'archive');
  const toReview = productsWithRec.filter(p => p.rec === 'review');

  const odooProductUrl = (id: number) => {
    const base = data.odoo_url || '';
    return `${base}/web#id=${id}&model=product.product&view_type=form`;
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-6">
        <div className="bg-white shadow-xl rounded-2xl p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Cadeaubonnen Overzicht
          </h1>
          <p className="text-gray-500 text-sm">
            Gift card programma&apos;s, producten, en aanbevelingen voor opschoning
          </p>
          <p className="text-gray-400 text-xs mt-1 font-mono">
            Database: {data.odoo_url}
          </p>
        </div>

        {/* Programs */}
        <Section title="Gift Card Programma's" count={data.programs.length}>
          <div className="space-y-4">
            {data.programs.map(prog => {
              const isMain = mainProgram && prog.id === mainProgram.id;
              const progProducts = data.products.filter(p => {
                for (const field of data.program_product_fields) {
                  const val = prog[field];
                  if (Array.isArray(val) && val.includes(p.id)) return true;
                }
                return false;
              });

              return (
                <div key={prog.id} className={`border-2 rounded-xl p-4 ${isMain ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-lg">{prog.name}</h3>
                        {isMain && (
                          <span className="bg-green-600 text-white px-2 py-0.5 rounded text-xs font-bold">
                            Winkel-app + POS
                          </span>
                        )}
                        {!prog.active && (
                          <span className="bg-gray-400 text-white px-2 py-0.5 rounded text-xs">Inactief</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        Program ID: {prog.id}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <div><span className="font-semibold">{prog.card_counts.total}</span> bonnen totaal</div>
                      <div><span className="font-semibold text-green-700">{prog.card_counts.with_balance}</span> met saldo</div>
                    </div>
                  </div>
                  {progProducts.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-gray-500 mb-1">Gekoppelde producten:</p>
                      <div className="flex flex-wrap gap-2">
                        {progProducts.map(p => (
                          <a
                            key={p.id}
                            href={odooProductUrl(p.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`text-xs px-2 py-1 rounded border ${hasRealTax(p) ? 'bg-red-50 border-red-300 text-red-800' : 'bg-gray-50 border-gray-300 text-gray-700'} hover:underline`}
                          >
                            ID {p.id}: {p.display_name || p.name}
                            {hasRealTax(p) && ' — BTW!'}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* Action needed */}
        {toFix.length > 0 && (
          <Section title="Actie nodig: BTW verwijderen" count={toFix.length}>
            <p className="text-red-700 text-sm mb-3">
              Deze producten zijn gekoppeld aan een gift card programma maar hebben onterecht BTW.
              Verwijder de Verkoop BTW bij elk product.
            </p>
            <ProductTable products={toFix} odooUrl={odooProductUrl} />
          </Section>
        )}

        {/* Keep */}
        <Section title="Behouden (in gebruik)" count={toKeep.length}>
          <ProductTable products={toKeep} odooUrl={odooProductUrl} />
        </Section>

        {/* Review */}
        {toReview.length > 0 && (
          <Section title="Nakijken" count={toReview.length}>
            <p className="text-yellow-700 text-sm mb-3">
              Deze producten zijn niet direct gekoppeld aan een programma.
              Controleer of je ze nog nodig hebt.
            </p>
            <ProductTable products={toReview} odooUrl={odooProductUrl} />
          </Section>
        )}

        {/* Archive */}
        {toArchive.length > 0 && (
          <Section title="Kunnen gearchiveerd worden" count={toArchive.length}>
            <p className="text-gray-500 text-sm mb-3">
              Deze producten zijn niet gekoppeld aan een actief programma en kunnen veilig gearchiveerd worden.
            </p>
            <ProductTable products={toArchive} odooUrl={odooProductUrl} />
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="bg-white shadow rounded-2xl p-6">
      <h2 className="text-lg font-bold text-gray-800 mb-4">
        {title} <span className="text-gray-400 font-normal text-sm">({count})</span>
      </h2>
      {children}
    </div>
  );
}

function ProductTable({ products, odooUrl }: { products: Array<Product & { rec: Recommendation; reason: string }>; odooUrl: (id: number) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2 pr-3">ID</th>
            <th className="py-2 pr-3">Naam</th>
            <th className="py-2 pr-3">Type</th>
            <th className="py-2 pr-3">Prijs</th>
            <th className="py-2 pr-3">BTW</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">Advies</th>
            <th className="py-2">Reden</th>
          </tr>
        </thead>
        <tbody>
          {products.map(p => {
            const style = recStyles[p.rec];
            return (
              <tr key={p.id} className={`border-b ${p.rec === 'fix' ? 'bg-red-50' : ''}`}>
                <td className="py-2 pr-3">
                  <a
                    href={odooUrl(p.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-blue-600 hover:underline"
                  >
                    {p.id}
                  </a>
                </td>
                <td className="py-2 pr-3 font-medium">{p.display_name || p.name}</td>
                <td className="py-2 pr-3 text-gray-500">{p.type}</td>
                <td className="py-2 pr-3">{p.list_price}&nbsp;&euro;</td>
                <td className="py-2 pr-3">
                  {hasRealTax(p) ? (
                    <span className="bg-red-200 text-red-800 px-2 py-0.5 rounded text-xs font-bold">
                      {p.taxes_detail.filter(t => t.amount > 0).map(t => `${t.amount}%`).join(', ')}
                    </span>
                  ) : (
                    <span className="text-green-700 text-xs font-semibold">
                      {p.taxes_detail.length > 0 ? p.taxes_detail.map(t => `${t.amount}% ${t.name}`).join(', ') : 'Geen'}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 text-xs">
                  {p.active ? 'Actief' : 'Inactief'}
                  {p.sale_ok ? ' / Verkoopbaar' : ''}
                  {p.linked_to_program ? ' / Gekoppeld' : ''}
                </td>
                <td className="py-2 pr-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${style.bg} ${style.text}`}>
                    {style.label}
                  </span>
                </td>
                <td className="py-2 text-xs text-gray-500">{p.reason}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
