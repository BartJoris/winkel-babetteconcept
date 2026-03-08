import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  generateZPL,
  getFirstLabelZpl,
  ZPL_LABEL_DPMM,
  ZPL_LABEL_WIDTH_IN,
  ZPL_LABEL_HEIGHT_IN,
  type ZplLabelProduct,
  type ZplLabelOptions,
  DEFAULT_LABEL_OPTIONS,
} from '@/lib/zpl-labels';

const LABELARY_VIEWER = 'https://labelary.com/viewer.html';
const LABELARY_API = 'https://api.labelary.com/v1';

/** ZPL: Zebra calibratie met label-setup (51×25mm, direct thermal, web-sensing) + ~JC. */
const ZPL_CALIBRATE = [
  '^XA',
  '^PW406',   // 51mm breed = 406 dots @ 203dpi
  '^LL200',   // 25mm lang = 200 dots @ 203dpi
  '^LH0,0',   // label home 0,0
  '^MNY',     // non-continuous web/gap sensing (die-cut labels)
  '^MTD',     // direct thermal
  '^JUS',     // opslaan in EEPROM
  '^XZ',
  '~JC',      // sensor calibratie
].join('');

/** ZPL: Diepe reset - alle relevante printer-parameters + calibratie. */
const ZPL_DEEP_CALIBRATE = [
  '^XA',
  '^PW406',   // 51mm breed
  '^LL200',   // 25mm lang
  '^LH0,0',   // label home
  '^MNY',     // web/gap sensing
  '^MTD',     // direct thermal
  '^MD10',    // darkness midden (0-30)
  '^PR4,4,4', // print speed 4 ips
  '^JUS',     // opslaan in EEPROM
  '^XZ',
  '~JC',      // sensor calibratie
].join('');

const DEFAULT_LABEL: ZplLabelProduct = {
  id: 0,
  name: 'Claude & Co - Noa mustard knit vest',
  barcode: '505677460865',
  list_price: 45.0,
  attributes: '12 maand',
  sizeRange: '12m/6j',
};

type EditMode = 'form' | 'zpl';

function formToProduct(form: {
  name: string;
  attributes: string;
  sizeRange: string;
  price: string;
  barcode: string;
}): ZplLabelProduct {
  const list_price = parseFloat(form.price.replace(',', '.')) || 0;
  return {
    id: 0,
    name: form.name.trim() || ' ',
    attributes: form.attributes.trim() || null,
    sizeRange: form.sizeRange.trim() || null,
    list_price,
    barcode: form.barcode.trim() || null,
  };
}

function productToForm(p: ZplLabelProduct): {
  name: string;
  attributes: string;
  sizeRange: string;
  price: string;
  barcode: string;
} {
  return {
    name: p.name,
    attributes: p.attributes ?? '',
    sizeRange: p.sizeRange ?? '',
    price: p.list_price.toFixed(2),
    barcode: p.barcode ?? '',
  };
}

export default function LabelsDebugPage() {
  const { isLoading } = useAuth();
  const [editMode, setEditMode] = useState<EditMode>('form');
  const [form, setForm] = useState(() => productToForm(DEFAULT_LABEL));
  const [typography, setTypography] = useState<ZplLabelOptions>(() => ({ ...DEFAULT_LABEL_OPTIONS }));
  const [zpl, setZpl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchZpl = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/test-label-zpl');
      if (!res.ok) throw new Error(res.statusText);
      const text = await res.text();
      setZpl(text);
      setForm(productToForm(DEFAULT_LABEL));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kon ZPL niet ophalen');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchZpl();
  }, []);

  const product = formToProduct(form);
  const fullTypography = { ...DEFAULT_LABEL_OPTIONS, ...typography };
  const zplFromForm = generateZPL([product], fullTypography);
  const effectiveZpl = editMode === 'form' ? zplFromForm : zpl;
  const firstLabelZpl = effectiveZpl ? getFirstLabelZpl(effectiveZpl) : '';

  const labelaryViewerUrl =
    firstLabelZpl &&
    `${LABELARY_VIEWER}?density=${ZPL_LABEL_DPMM}&width=${ZPL_LABEL_WIDTH_IN}&height=${ZPL_LABEL_HEIGHT_IN}&units=inches&zpl=${encodeURIComponent(effectiveZpl)}`;
  const previewImageUrl =
    firstLabelZpl &&
    `${LABELARY_API}/printers/${ZPL_LABEL_DPMM}dpmm/labels/${ZPL_LABEL_WIDTH_IN}x${ZPL_LABEL_HEIGHT_IN}/0/${encodeURIComponent(firstLabelZpl)}?v=${fullTypography.marginTop}-${fullTypography.marginLeft}`;

  const printToZebra = async () => {
    const toPrint = effectiveZpl?.trim();
    if (!toPrint) {
      setError('Geen ZPL om te printen.');
      return;
    }
    setPrinting(true);
    setError(null);
    try {
      const res = await fetch('/api/print-zpl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zpl: toPrint }),
      }).catch(() => null);
      if (res?.ok) {
        const data = await res.json().catch(() => ({}));
        const count = data.labels ?? 1;
        alert(`Label direct naar Zebra gestuurd (${count} label(s)).`);
      } else {
        const err = await res?.json().catch(() => ({}));
        setError(err?.error || 'Printen mislukt. Start op de server: npm run print-zebra');
      }
    } finally {
      setPrinting(false);
    }
  };

  const calibratePrinter = async (deep = false) => {
    const msg = deep
      ? 'Diepe calibratie? Alle printerinstellingen (formaat, mediatype, darkness) worden gereset en opgeslagen. Doorgaan?'
      : 'Printer calibreer? Labelformaat en mediatype worden ingesteld, daarna calibreert de sensor. Doorgaan?';
    if (!confirm(msg)) return;
    setCalibrating(true);
    setError(null);
    try {
      const zpl = deep ? ZPL_DEEP_CALIBRATE : ZPL_CALIBRATE;
      const res = await fetch('/api/print-zpl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zpl }),
      }).catch(() => null);
      if (res?.ok) {
        alert(
          deep
            ? 'Diepe calibratie verstuurd. Alle instellingen zijn opgeslagen en de sensor is gekalibreerd.'
            : 'Calibratie verstuurd. De printer kan nu een paar labels doorvoeren; daarna staat de uitlijning weer goed.'
        );
      } else {
        const err = await res?.json().catch(() => ({}));
        setError(err?.error || 'Calibratie mislukt. Controleer of de bridge bereikbaar is.');
      }
    } finally {
      setCalibrating(false);
    }
  };

  const switchToZpl = () => {
    setZpl(zplFromForm);
    setEditMode('zpl');
  };

  const resetForm = () => {
    setForm(productToForm(DEFAULT_LABEL));
    setEditMode('form');
  };

  const loadZplFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      setZpl(content);
      setEditMode('zpl');
    };
    reader.onerror = () => setError('Bestand kon niet gelezen worden.');
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <p className="text-gray-600">Laden...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 font-sans">
      <div className="max-w-5xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Zebra-label debug</h1>
        <p className="text-slate-600 mb-6">
          Bewerk het label zoals in Word: vul de velden in en bekijk de preview direct. Formaat 51×25 mm (2×1 in, 203 dpi).
        </p>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        <div className="flex gap-2 flex-wrap mb-4">
          <button
            type="button"
            onClick={() => setEditMode('form')}
            className={`px-3 py-1.5 text-sm rounded transition ${
              editMode === 'form'
                ? 'bg-slate-700 text-white'
                : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
            }`}
          >
            Label bewerken
          </button>
          <button
            type="button"
            onClick={switchToZpl}
            className={`px-3 py-1.5 text-sm rounded transition ${
              editMode === 'zpl'
                ? 'bg-slate-700 text-white'
                : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
            }`}
          >
            ZPL bewerken
          </button>
          {editMode === 'form' && (
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 text-sm bg-slate-200 hover:bg-slate-300 rounded transition"
            >
              Reset naar standaard
            </button>
          )}
          {editMode === 'zpl' && (
            <button
              type="button"
              onClick={fetchZpl}
              disabled={loading}
              className="px-3 py-1.5 text-sm bg-slate-200 hover:bg-slate-300 rounded transition disabled:opacity-50"
            >
              {loading ? 'Laden…' : 'Vernieuw ZPL'}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".zpl,.txt,text/plain"
            className="hidden"
            onChange={loadZplFile}
            aria-label="ZPL-bestand kiezen"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 text-sm bg-slate-200 hover:bg-slate-300 rounded transition"
          >
            ZPL-bestand laden…
          </button>
          {labelaryViewerUrl && (
            <a
              href={labelaryViewerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded transition"
            >
              Open in Labelary →
            </a>
          )}
          <button
            type="button"
            onClick={printToZebra}
            disabled={printing || !effectiveZpl?.trim()}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none text-white rounded transition"
          >
            {printing ? 'Printen…' : 'Print naar Zebra'}
          </button>
          <button
            type="button"
            onClick={() => calibratePrinter(false)}
            disabled={calibrating}
            className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded transition"
            title="Labelformaat instellen + sensor calibratie"
          >
            {calibrating ? 'Bezig…' : 'Calibreer'}
          </button>
          <button
            type="button"
            onClick={() => calibratePrinter(true)}
            disabled={calibrating}
            className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded transition"
            title="Volledige reset: formaat, mediatype, darkness, snelheid + calibratie"
          >
            {calibrating ? 'Bezig…' : 'Diep calibreer'}
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="min-h-0">
            {editMode === 'form' ? (
              <div className="bg-white border border-slate-300 rounded-lg p-4 shadow-sm space-y-4 max-h-[85vh] overflow-y-auto">
                <div className="pb-4 border-b-2 border-blue-200 bg-blue-50/50 rounded-lg px-3 py-3 -mx-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-800">Typografie (lettergrootte &amp; regelafstand)</h3>
                    <button
                      type="button"
                      onClick={() => setTypography({ ...DEFAULT_LABEL_OPTIONS })}
                      className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      Reset
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">
                    Lettergroottes en ruimtes in dots (203 dpi). Preview werkt direct.
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <label className="flex items-center gap-2 col-span-2">
                      <span className="text-slate-600 w-36">Ruimte boven (rand → tekst)</span>
                      <input
                        type="number"
                        min={0}
                        max={80}
                        value={fullTypography.marginTop}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (!Number.isNaN(v)) setTypography((t) => ({ ...t, marginTop: v }));
                        }}
                        className="w-14 px-2 py-1 border border-slate-300 rounded"
                      />
                      <span className="text-slate-500 text-xs">dots — hoger = meer wit boven</span>
                    </label>
                    <label className="flex items-center gap-2 col-span-2">
                      <span className="text-slate-600 w-36">Marge links (rand → tekst)</span>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={fullTypography.marginLeft}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (!Number.isNaN(v)) setTypography((t) => ({ ...t, marginLeft: v }));
                        }}
                        className="w-14 px-2 py-1 border border-slate-300 rounded"
                      />
                      <span className="text-slate-500 text-xs">dots — rechts = zelfde marge</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="text-slate-600 w-36">Productnaam grootte</span>
                      <input
                        type="number"
                        min={8}
                        max={40}
                        value={typography.nameFontH ?? DEFAULT_LABEL_OPTIONS.nameFontH}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (!Number.isNaN(v)) setTypography((t) => ({ ...t, nameFontH: v }));
                        }}
                        className="w-14 px-2 py-1 border border-slate-300 rounded"
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="text-slate-600 w-36">Regelafstand naam</span>
                      <input
                        type="number"
                        min={8}
                        max={30}
                        value={typography.nameLineH ?? DEFAULT_LABEL_OPTIONS.nameLineH}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (!Number.isNaN(v)) setTypography((t) => ({ ...t, nameLineH: v }));
                        }}
                        className="w-14 px-2 py-1 border border-slate-300 rounded"
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="text-slate-600 w-36">Max regels naam</span>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={typography.nameLines ?? DEFAULT_LABEL_OPTIONS.nameLines}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (!Number.isNaN(v)) setTypography((t) => ({ ...t, nameLines: v }));
                        }}
                        className="w-14 px-2 py-1 border border-slate-300 rounded"
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="text-slate-600 w-36">Ruimte na naam</span>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        value={typography.nameToVariantGap ?? DEFAULT_LABEL_OPTIONS.nameToVariantGap}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (!Number.isNaN(v)) setTypography((t) => ({ ...t, nameToVariantGap: v }));
                        }}
                        className="w-14 px-2 py-1 border border-slate-300 rounded"
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="text-slate-600 w-36">Attributen grootte</span>
                      <input
                        type="number"
                        min={8}
                        max={36}
                        value={typography.variantFontH ?? DEFAULT_LABEL_OPTIONS.variantFontH}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (!Number.isNaN(v)) setTypography((t) => ({ ...t, variantFontH: v }));
                        }}
                        className="w-14 px-2 py-1 border border-slate-300 rounded"
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="text-slate-600 w-36">Ruimte voor prijs</span>
                      <input
                        type="number"
                        min={0}
                        max={25}
                        value={typography.variantToPriceGap ?? DEFAULT_LABEL_OPTIONS.variantToPriceGap}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (!Number.isNaN(v)) setTypography((t) => ({ ...t, variantToPriceGap: v }));
                        }}
                        className="w-14 px-2 py-1 border border-slate-300 rounded"
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="text-slate-600 w-36">Prijs grootte</span>
                      <input
                        type="number"
                        min={12}
                        max={48}
                        value={typography.priceH ?? DEFAULT_LABEL_OPTIONS.priceH}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (!Number.isNaN(v)) setTypography((t) => ({ ...t, priceH: v }));
                        }}
                        className="w-14 px-2 py-1 border border-slate-300 rounded"
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <h2 className="font-medium text-slate-700 mb-3">Labelinhoud</h2>
                  <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">
                      Productnaam
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                      placeholder="Bijv. Claude & Co - Noa mustard knit vest"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">
                      Attributen
                    </label>
                    <input
                      type="text"
                      value={form.attributes}
                      onChange={(e) => setForm((f) => ({ ...f, attributes: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                      placeholder="Bijv. 12 maand"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">
                      Maat / range
                    </label>
                    <input
                      type="text"
                      value={form.sizeRange}
                      onChange={(e) => setForm((f) => ({ ...f, sizeRange: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                      placeholder="Bijv. 12m/6j"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">
                      Prijs (€)
                    </label>
                    <input
                      type="text"
                      value={form.price}
                      onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                      placeholder="45.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">
                      Barcode (optioneel)
                    </label>
                    <input
                      type="text"
                      value={form.barcode}
                      onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 font-mono"
                      placeholder="505677460865"
                    />
                  </div>
                </div>
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  Wijzigingen verschijnen direct in de preview rechts.
                </p>
              </div>
            ) : (
              <div>
                <label className="font-medium text-slate-700 block mb-2">ZPL (bewerkbaar)</label>
                <textarea
                  value={zpl}
                  onChange={(e) => setZpl(e.target.value)}
                  className="w-full h-80 font-mono text-sm p-3 border border-slate-300 rounded-lg bg-white"
                  placeholder="ZPL…"
                  spellCheck={false}
                />
              </div>
            )}
          </div>

          <div>
            <label className="font-medium text-slate-700 block mb-2">Preview</label>
            <div className="border border-slate-300 rounded-lg bg-white p-4 flex items-center justify-center min-h-80">
              {firstLabelZpl ? (
                <img
                  key={previewImageUrl ?? ''}
                  src={previewImageUrl ?? ''}
                  alt="Label preview"
                  className="max-w-full max-h-96 object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : (
                <span className="text-slate-400">Geen geldig label</span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-2">
              Formaat: 2×1 inch, 8 dpmm (203 dpi). Gebruik &quot;Open in Labelary&quot; voor nauwkeurige controle.
            </p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-sm">
          <strong>Tip:</strong> Onder &quot;Label bewerken&quot; kun je bij <strong>Typografie</strong> de
          lettergroottes en regelafstand aanpassen (zoals in Word). Preview werkt direct. Voor directe ZPL gebruik
          &quot;ZPL bewerken&quot;.
        </div>
      </div>
    </div>
  );
}
