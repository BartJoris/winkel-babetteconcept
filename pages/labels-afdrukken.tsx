import { useState, useRef, useCallback, useEffect, Fragment } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  printProductLabels,
  loadPrinterPreference,
  loadLabelFormatPreference,
  savePrinterPreference,
  saveLabelFormatPreference,
  type PrinterType,
  type LabelFormat,
} from '@/lib/print-product-labels-client';

interface ScannedProduct {
  id: number;
  name: string;
  barcode: string | null;
  list_price: number;
  qty_available: number;
  attributes: string | null;
  sizeRange: string | null;
  count: number;
  /** Odoo product.template id: zelfde product, andere maten/varianten */
  productTmplId?: number | null;
  stockStatus?: 'success' | 'error' | 'pending';
  stockError?: string;
}

interface SearchResult {
  id: number;
  name: string;
  barcode: string | null;
  qty_available: number;
  list_price: number;
  attributes: string | null;
  productTmplId: number | null;
}

type ReassignStep = 'confirm-clear' | 'search' | 'pick-variant';

interface BarcodeReassignState {
  step: ReassignStep;
  barcode: string;
  /** Set when barcode was taken from an archived product; null when assigning a free barcode */
  archivedProduct: { id: number; name: string; barcode?: string | null } | null;
  searchQuery: string;
  searchResults: SearchResult[];
  variants: Array<{
    id: number;
    name?: string;
    barcode?: string | null;
    list_price?: number;
    qty_available?: number;
    attributes?: string | null;
  }>;
  productName: string;
  searching: boolean;
  loadingVariants: boolean;
  working: boolean;
}

const formatEuro = (amount: number) =>
  amount.toLocaleString('nl-BE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

/** ZPL: Zebra calibratie met label-setup (51×25mm, direct thermal, web-sensing) + ~JC. */
const ZPL_CALIBRATE = [
  '^XA',
  '^PW406',   // 51mm breed = 406 dots @ 203dpi
  '^LL200',   // 25mm lang = 200 dots @ 203dpi
  '^LH0,0',   // label home 0,0
  '^LT0',     // label top offset reset
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
  '^LT0',     // label top offset reset
  '^MNY',     // web/gap sensing
  '^MTD',     // direct thermal
  '^MD10',    // darkness midden (0-30)
  '^PR4,4,4', // print speed 4 ips
  '^JUS',     // opslaan in EEPROM
  '^XZ',
  '~JC',      // sensor calibratie
].join('');

export default function LabelsAfdrukkenPage() {
  const { isLoading } = useAuth();
  const [barcode, setBarcode] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [scannedProducts, setScannedProducts] = useState<ScannedProduct[]>([]);
  const [adjustingStock, setAdjustingStock] = useState(false);
  const [printingLabels, setPrintingLabels] = useState(false);
  const [calibratingZebra, setCalibratingZebra] = useState(false);
  const [printer, setPrinter] = useState<PrinterType>('zebra');
  const [labelFormat, setLabelFormat] = useState<LabelFormat>('normal');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [barcodeReassign, setBarcodeReassign] = useState<BarcodeReassignState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reassignSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPrinter(loadPrinterPreference());
  }, []);

  useEffect(() => {
    setLabelFormat(loadLabelFormatPreference());
  }, []);

  const togglePrinter = () => {
    const next: PrinterType = printer === 'zebra' ? 'dymo' : 'zebra';
    setPrinter(next);
    savePrinterPreference(next);
  };

  const toggleLabelFormat = () => {
    const next: LabelFormat = labelFormat === 'normal' ? 'small' : 'normal';
    setLabelFormat(next);
    saveLabelFormatPreference(next);
  };

  const calibrateZebra = async (deep = false) => {
    const msg = deep
      ? 'Diepe calibratie? Alle printerinstellingen (formaat, mediatype, darkness) worden gereset en opgeslagen. De printer kan een paar labels doorvoeren. Doorgaan?'
      : 'Zebra calibreer? Labelformaat en mediatype worden ingesteld, daarna calibreert de sensor. De printer kan een paar labels doorvoeren. Doorgaan?';
    if (!confirm(msg)) return;
    setCalibratingZebra(true);
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
            : 'Calibratie verstuurd. Printer kan een paar labels doorvoeren; daarna staat de uitlijning weer goed.'
        );
      } else {
        alert('Calibratie mislukt. Controleer of de Zebra-bridge bereikbaar is.');
      }
    } finally {
      setCalibratingZebra(false);
    }
  };

  const focusInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const addProduct = useCallback((product: any) => {
    setScannedProducts((prev) => {
      const existing = prev.find((p) => p.id === product.id);
      if (existing) {
        return prev.map((p) =>
          p.id === product.id
            ? { ...p, count: p.count + 1, stockStatus: undefined, stockError: undefined }
            : p
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          barcode: product.barcode || null,
          list_price: product.list_price || 0,
          qty_available: product.qty_available || 0,
          attributes: product.attributes || null,
          sizeRange: product.sizeRange || null,
          count: 1,
          productTmplId: product.productTmplId ?? null,
        },
      ];
    });
  }, []);

  const autoScanDoneRef = useRef(false);
  const reassignOpenedAtRef = useRef(0);

  const scanBarcode = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    setScanLoading(true);
    let openedReassign = false;
    try {
      // Same request as voorraad-opzoeken (no light) so archived-conflict handling matches
      const res = await fetch('/api/scan-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: trimmed }),
      });

      const json = await res.json();

      if (json.archivedConflict || json.archivedProduct) {
        const archived = json.archivedProduct || {
          id: 0,
          name: 'onbekend product',
        };
        const wantClear = confirm(
          `Barcode zit op gearchiveerd product:\n"${archived.name}"\n\n` +
            `Wil je de barcode leegmaken bij het gearchiveerde product?`
        );
        if (!wantClear) {
          return;
        }

        openedReassign = true;
        setScanLoading(false);
        // Clear immediately, then open search/assign UI (same flow as voorraad)
        const clearRes = await fetch('/api/reassign-barcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'clear',
            barcode: json.barcode || trimmed,
            archivedProductId: archived.id,
          }),
        });
        const clearJson = await clearRes.json();
        if (!clearRes.ok || !clearJson.success) {
          alert(`Fout: ${clearJson.error || 'Kon barcode niet leegmaken'}`);
          return;
        }

        reassignOpenedAtRef.current = Date.now();
        setBarcodeReassign({
          step: 'search',
          barcode: json.barcode || trimmed,
          archivedProduct: archived,
          searchQuery: '',
          searchResults: [],
          variants: [],
          productName: '',
          searching: false,
          loadingVariants: false,
          working: false,
        });
        return;
      }

      if (json.isGiftCard && json.giftCard) {
        const g = json.giftCard;
        const expiry = g.expiration_date ? new Date(g.expiration_date).toLocaleDateString('nl-BE') : '';
        alert(`🎁 Cadeaubon herkend\n\nCode: ${g.code}\nSaldo: €${Number(g.balance ?? g.points ?? 0).toFixed(2)}${expiry ? `\nGeldig tot: ${expiry}` : ''}\n\nGebruik de kassa (Odoo POS) om de bon te verzilveren.`);
      } else if (json.isSearchResults) {
        const exactMatch = json.searchResults.find(
          (p: any) => p.barcode === trimmed
        );
        if (exactMatch) {
          addProduct(exactMatch);
        } else if (json.searchResults.length === 1) {
          addProduct(json.searchResults[0]);
        } else {
          setSearchResults(json.searchResults);
          setSearchQuery(trimmed);
        }
      } else if (json.success) {
        const scannedVariant = json.variants?.find((v: any) => v.isScanned) || json.scannedVariant;
        if (scannedVariant) {
          addProduct({
            id: scannedVariant.id,
            name: scannedVariant.name || json.productName,
            barcode: scannedVariant.barcode,
            list_price: scannedVariant.list_price,
            qty_available: scannedVariant.qty_available,
            attributes: scannedVariant.attributes,
            sizeRange: json.sizeRange,
            productTmplId: json.productTmplId ?? null,
          });
        } else if (json.variants?.length === 1) {
          const v = json.variants[0];
          addProduct({
            id: v.id,
            name: v.name || json.productName,
            barcode: v.barcode,
            list_price: v.list_price,
            qty_available: v.qty_available,
            attributes: v.attributes,
            sizeRange: json.sizeRange,
            productTmplId: json.productTmplId ?? null,
          });
        } else {
          const wantAssign = confirm(
            `Product niet gevonden: ${json.error || 'Onbekende fout'}\n\n` +
              `Wil je barcode "${trimmed}" toewijzen aan een bestaand product?`
          );
          if (wantAssign) {
            openedReassign = true;
            reassignOpenedAtRef.current = Date.now();
            setBarcodeReassign({
              step: 'search',
              barcode: trimmed,
              archivedProduct: null,
              searchQuery: '',
              searchResults: [],
              variants: [],
              productName: '',
              searching: false,
              loadingVariants: false,
              working: false,
            });
            setTimeout(() => reassignSearchRef.current?.focus(), 100);
          }
        }
      } else {
        const wantAssign = confirm(
          `Product niet gevonden: ${json.error || 'Onbekende fout'}\n\n` +
            `Wil je barcode "${trimmed}" toewijzen aan een bestaand product?`
        );
        if (wantAssign) {
          openedReassign = true;
          reassignOpenedAtRef.current = Date.now();
          setBarcodeReassign({
            step: 'search',
            barcode: trimmed,
            archivedProduct: null,
            searchQuery: '',
            searchResults: [],
            variants: [],
            productName: '',
            searching: false,
            loadingVariants: false,
            working: false,
          });
          setTimeout(() => reassignSearchRef.current?.focus(), 100);
        }
      }
    } catch (err) {
      console.error('Error scanning product:', err);
      alert('Fout bij scannen van product');
    } finally {
      setBarcode('');
      setScanLoading(false);
      if (!openedReassign) {
        focusInput();
      }
    }
  };

  const handleScan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await scanBarcode(barcode);
  };

  useEffect(() => {
    if (isLoading || autoScanDoneRef.current) return;
    const q = new URLSearchParams(window.location.search).get('barcode')?.trim();
    if (!q) return;
    autoScanDoneRef.current = true;
    window.history.replaceState({}, '', window.location.pathname);
    void scanBarcode(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when auth ready for ?barcode=
  }, [isLoading]);

  const handleSearchResultClick = async (product: SearchResult) => {
    setVariantsLoading(true);
    try {
      const res = await fetch('/api/scan-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id }),
      });
      const json = await res.json();

      const sizeRange = json.sizeRange ?? null;
      const productTmplId = json.productTmplId ?? product.productTmplId ?? null;
      const variants = json.success ? json.variants ?? [] : [];

      const wantAll = variants.length > 1 && confirm(
        `Alle ${variants.length} varianten van "${json.productName || product.name}" toevoegen?\n\nKlik "OK" voor alle varianten, of "Annuleren" voor enkel deze variant.`
      );

      if (wantAll) {
        for (const v of variants) {
          addProduct({
            id: v.id,
            name: v.name || json.productName,
            barcode: v.barcode,
            list_price: v.list_price,
            qty_available: v.qty_available,
            attributes: v.attributes,
            sizeRange,
            productTmplId,
          });
        }
      } else {
        addProduct({
          ...product,
          sizeRange,
          productTmplId,
        });
      }
    } catch {
      addProduct(product);
    } finally {
      setVariantsLoading(false);
    }

    setSearchResults([]);
    setSearchQuery('');
    focusInput();
  };

  const closeBarcodeReassign = () => {
    setBarcodeReassign(null);
    focusInput();
  };

  const handleClearArchivedBarcode = async () => {
    if (!barcodeReassign || barcodeReassign.working) return;
    if (!barcodeReassign.archivedProduct?.id) {
      alert('Gearchiveerd product ontbreekt');
      return;
    }

    setBarcodeReassign((prev) => (prev ? { ...prev, working: true } : prev));
    try {
      const res = await fetch('/api/reassign-barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clear',
          barcode: barcodeReassign.barcode,
          archivedProductId: barcodeReassign.archivedProduct.id,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(`Fout: ${json.error || 'Kon barcode niet leegmaken'}`);
        setBarcodeReassign((prev) => (prev ? { ...prev, working: false } : prev));
        return;
      }

      setBarcodeReassign((prev) =>
        prev
          ? {
              ...prev,
              step: 'search',
              working: false,
              searchQuery: '',
              searchResults: [],
              variants: [],
            }
          : prev
      );
      setTimeout(() => reassignSearchRef.current?.focus(), 100);
    } catch (err) {
      console.error('Error clearing archived barcode:', err);
      alert('Fout bij leegmaken van barcode');
      setBarcodeReassign((prev) => (prev ? { ...prev, working: false } : prev));
    }
  };

  const handleReassignSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!barcodeReassign) return;
    const trimmed = barcodeReassign.searchQuery.trim();
    if (!trimmed) return;

    setBarcodeReassign((prev) =>
      prev ? { ...prev, searching: true, searchResults: [], variants: [], step: 'search' } : prev
    );
    try {
      const res = await fetch('/api/scan-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: trimmed }),
      });
      const json = await res.json();

      if (json.archivedConflict) {
        alert('Die barcode zit nog op een gearchiveerd product. Zoek op productnaam.');
        setBarcodeReassign((prev) => (prev ? { ...prev, searching: false } : prev));
        return;
      }

      if (json.success && json.isSearchResults) {
        setBarcodeReassign((prev) =>
          prev
            ? {
                ...prev,
                searching: false,
                step: 'search',
                searchResults: json.searchResults,
                variants: [],
              }
            : prev
        );
        return;
      }

      if (json.success && json.variants?.length) {
        setBarcodeReassign((prev) =>
          prev
            ? {
                ...prev,
                searching: false,
                step: 'pick-variant',
                searchResults: [],
                variants: json.variants,
                productName: json.productName || '',
              }
            : prev
        );
        return;
      }

      setBarcodeReassign((prev) => (prev ? { ...prev, searching: false, searchResults: [] } : prev));
      alert(`Geen actief product gevonden: ${json.error || 'Onbekende fout'}`);
    } catch (err) {
      console.error('Error searching for reassign target:', err);
      alert('Fout bij zoeken van product');
      setBarcodeReassign((prev) => (prev ? { ...prev, searching: false } : prev));
    }
  };

  const handleReassignPickProduct = async (productId: number) => {
    if (!barcodeReassign) return;
    setBarcodeReassign((prev) => (prev ? { ...prev, loadingVariants: true } : prev));
    try {
      const res = await fetch('/api/scan-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      const json = await res.json();
      if (!json.success || !json.variants?.length) {
        alert(`Kon varianten niet laden: ${json.error || 'Onbekende fout'}`);
        setBarcodeReassign((prev) => (prev ? { ...prev, loadingVariants: false } : prev));
        return;
      }
      setBarcodeReassign((prev) =>
        prev
          ? {
              ...prev,
              loadingVariants: false,
              step: 'pick-variant',
              variants: json.variants,
              productName: json.productName || '',
            }
          : prev
      );
    } catch (err) {
      console.error('Error loading variants for reassign:', err);
      alert('Fout bij laden van varianten');
      setBarcodeReassign((prev) => (prev ? { ...prev, loadingVariants: false } : prev));
    }
  };

  const handleAssignBarcodeToVariant = async (
    variantId: number,
    variantLabel: string,
    existingBarcode?: string | null
  ) => {
    if (!barcodeReassign || barcodeReassign.working) return;

    const currentBarcode =
      typeof existingBarcode === 'string' && existingBarcode.trim() ? existingBarcode.trim() : '';
    let replaceExisting = false;

    if (currentBarcode && currentBarcode !== barcodeReassign.barcode) {
      const replace = confirm(
        `Deze variant heeft al barcode "${currentBarcode}".\n\n` +
          `Wil je het huidige barcode vervangen met de gescande barcode "${barcodeReassign.barcode}"?`
      );
      if (!replace) return;
      replaceExisting = true;
    } else if (
      !confirm(`Barcode ${barcodeReassign.barcode} toewijzen aan:\n"${variantLabel}"?`)
    ) {
      return;
    }

    setBarcodeReassign((prev) => (prev ? { ...prev, working: true } : prev));
    try {
      const assignOnce = async (replace: boolean) => {
        const res = await fetch('/api/reassign-barcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'assign',
            barcode: barcodeReassign.barcode,
            targetProductId: variantId,
            replaceExisting: replace,
          }),
        });
        const json = await res.json();
        return { res, json };
      };

      let { res, json } = await assignOnce(replaceExisting);

      if (!res.ok && json.needsReplace && json.existingBarcode) {
        const replace = confirm(
          `Deze variant heeft al barcode "${json.existingBarcode}".\n\n` +
            `Wil je het huidige barcode vervangen met de gescande barcode "${barcodeReassign.barcode}"?`
        );
        if (!replace) {
          setBarcodeReassign((prev) => (prev ? { ...prev, working: false } : prev));
          return;
        }
        ({ res, json } = await assignOnce(true));
      }

      if (!res.ok || !json.success || !json.product) {
        alert(`Fout: ${json.error || 'Kon barcode niet toewijzen'}`);
        setBarcodeReassign((prev) => (prev ? { ...prev, working: false } : prev));
        return;
      }

      addProduct(json.product);
      closeBarcodeReassign();
    } catch (err) {
      console.error('Error assigning barcode:', err);
      alert('Fout bij toewijzen van barcode');
      setBarcodeReassign((prev) => (prev ? { ...prev, working: false } : prev));
    }
  };

  const updateCount = (id: number, count: number) => {
    if (count < 1) return;
    setScannedProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, count } : p))
    );
  };

  const updateField = (id: number, field: 'name' | 'attributes', value: string) => {
    setScannedProducts((prev) => {
      const product = prev.find((p) => p.id === id);
      const productTmplId = product?.productTmplId;
      // Bij naam: ook alle andere varianten van hetzelfde product (zelfde template) bijwerken
      const sameProductIds =
        field === 'name' && productTmplId != null
          ? prev.filter((p) => p.productTmplId === productTmplId).map((p) => p.id)
          : [id];
      const idSet = new Set(sameProductIds);
      return prev.map((p) =>
        idSet.has(p.id) ? { ...p, [field]: value || null } : p
      );
    });
  };

  const removeProduct = (id: number) => {
    setScannedProducts((prev) => prev.filter((p) => p.id !== id));
  };

  const clearAll = () => {
    if (scannedProducts.length === 0) return;
    if (confirm('Weet je zeker dat je de lijst wilt wissen?')) {
      setScannedProducts([]);
      focusInput();
    }
  };

  const handleAdjustStock = async () => {
    if (scannedProducts.length === 0) return;
    if (!confirm(`Voorraad aanpassen voor ${scannedProducts.length} product(en)?\n\nDe huidige voorraad wordt ingesteld op het ingevoerde aantal.`)) {
      return;
    }

    setAdjustingStock(true);

    // Mark all as pending
    setScannedProducts((prev) =>
      prev.map((p) => ({ ...p, stockStatus: 'pending' as const, stockError: undefined }))
    );

    try {
      const res = await fetch('/api/adjust-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: scannedProducts.map((p) => ({
            productId: p.id,
            quantity: p.count,
          })),
        }),
      });

      const json = await res.json();

      if (json.results) {
        setScannedProducts((prev) =>
          prev.map((p) => {
            const result = json.results.find((r: any) => r.productId === p.id);
            if (!result) return { ...p, stockStatus: 'error' as const, stockError: 'Geen resultaat' };
            return {
              ...p,
              stockStatus: result.success ? ('success' as const) : ('error' as const),
              stockError: result.error,
              qty_available: result.success ? p.count : p.qty_available,
            };
          })
        );

        const successCount = json.results.filter((r: any) => r.success).length;
        const message = json.message || `${successCount} van ${scannedProducts.length} producten aangepast`;

        if (successCount > 0) {
          const wantPrint = confirm(
            `${message}\n\nWil je de labels nu afdrukken?`
          );
          setAdjustingStock(false);
          if (wantPrint) {
            await handlePrintLabels();
          }
          return;
        }

        alert(message);
      } else {
        alert(`Fout: ${json.error || 'Kon voorraad niet aanpassen'}`);
        setScannedProducts((prev) =>
          prev.map((p) => ({ ...p, stockStatus: 'error' as const, stockError: json.error }))
        );
      }
    } catch (err) {
      console.error('Error adjusting stock:', err);
      alert('Fout bij aanpassen van voorraad');
      setScannedProducts((prev) =>
        prev.map((p) => ({ ...p, stockStatus: 'error' as const, stockError: 'Netwerk fout' }))
      );
    } finally {
      setAdjustingStock(false);
    }
  };

  const handlePrintLabels = async () => {
    if (scannedProducts.length === 0) return;

    setPrintingLabels(true);
    try {
      const result = await printProductLabels({
        products: scannedProducts,
        printer,
        format: labelFormat,
        onClearList: () => {
          setScannedProducts([]);
          focusInput();
        },
      });
      switch (result.status) {
        case 'zpl-printed':
          focusInput();
          break;
        case 'html-printed':
        case 'cancelled':
        case 'popup-blocked':
        case 'error':
          break;
        default: {
          const _exhaustive: never = result;
          return _exhaustive;
        }
      }
    } finally {
      setPrintingLabels(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
        <div className="p-8 text-center">
          <p className="text-xl text-gray-600">Laden...</p>
        </div>
      </div>
    );
  }

  const totalLabels = scannedProducts.reduce((sum, p) => sum + p.count, 0);

  // Groepeer op productTmplId zodat we varianten visueel kunnen groeperen
  const productGroups = (() => {
    const byTmpl = new Map<number | string, ScannedProduct[]>();
    for (const p of scannedProducts) {
      const key = p.productTmplId != null ? p.productTmplId : `single-${p.id}`;
      if (!byTmpl.has(key)) byTmpl.set(key, []);
      byTmpl.get(key)!.push(p);
    }
    return Array.from(byTmpl.entries()).map(([key, products]) => ({ key, products }));
  })();

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 font-sans">
      <div className="p-4 sm:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  🏷️ Labels Afdrukken
                </h1>
                <p className="text-gray-600 mt-2">
                  Scan producten, pas voorraad aan en druk prijslabels af
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`/api/test-label?printer=${printer}&format=${labelFormat}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm border-2 border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-all shrink-0"
                  title="Print één testlabel met het gekozen formaat"
                >
                  🧪 Testlabel
                </a>
                <button
                  onClick={toggleLabelFormat}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm border-2 transition-all shrink-0 ${
                    labelFormat === 'normal'
                      ? 'border-gray-400 bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'border-amber-500 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                  title={labelFormat === 'normal' ? 'Klik voor klein formaat (25×25mm)' : 'Klik voor normaal formaat'}
                >
                  📐 {labelFormat === 'normal' ? 'Normaal formaat' : 'Klein (25×25mm)'}
                </button>
                <button
                  onClick={togglePrinter}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm border-2 transition-all shrink-0 ${
                    printer === 'zebra'
                      ? 'border-black bg-gray-900 text-white hover:bg-gray-800'
                      : 'border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
                >
                  🖨️ {printer === 'zebra' ? 'Zebra ZD421d (51×25mm)' : 'Dymo (25×54mm)'}
                </button>
                {printer === 'zebra' && (
                  <>
                    <button
                      type="button"
                      onClick={() => calibrateZebra(false)}
                      disabled={calibratingZebra}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm border-2 border-amber-500 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-all shrink-0 disabled:opacity-50"
                      title="Labelformaat instellen + sensor calibratie"
                    >
                      {calibratingZebra ? 'Bezig…' : '⚙️ Calibreer'}
                    </button>
                    <button
                      type="button"
                      onClick={() => calibrateZebra(true)}
                      disabled={calibratingZebra}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm border-2 border-red-400 bg-red-50 text-red-800 hover:bg-red-100 transition-all shrink-0 disabled:opacity-50"
                      title="Volledige reset: formaat, mediatype, darkness, snelheid + calibratie"
                    >
                      {calibratingZebra ? 'Bezig…' : '🔧 Diep calibreer'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Scanner */}
          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <form onSubmit={handleScan} className="flex gap-3">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Scan barcode of zoek op naam..."
                  className="w-full px-4 py-3 pr-10 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg"
                  autoFocus
                  disabled={scanLoading}
                />
                {barcode && (
                  <button
                    type="button"
                    onClick={() => setBarcode('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={scanLoading}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all"
              >
                {scanLoading ? '⏳ Scannen...' : '📷 Scan'}
              </button>
            </form>

            {scannedProducts.length > 0 && (
              <div className="mt-3 flex items-center gap-3 text-sm text-gray-600">
                <span>{scannedProducts.length} product(en), {totalLabels} label(s)</span>
              </div>
            )}
          </div>

          {/* Search Results Modal */}
          {searchResults.length > 0 && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-[10vh] px-4" onClick={() => { setSearchResults([]); setSearchQuery(''); }}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">
                      🔍 Zoekresultaten voor &ldquo;{searchQuery}&rdquo;
                    </h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {searchResults.length} resultaten — klik om toe te voegen
                    </p>
                  </div>
                  <button
                    onClick={() => { setSearchResults([]); setSearchQuery(''); }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                  {variantsLoading && (
                    <div className="px-6 py-8 text-center text-gray-500 font-medium">
                      ⏳ Varianten ophalen...
                    </div>
                  )}
                  {!variantsLoading && (() => {
                    const grouped = new Map<number | string, SearchResult[]>();
                    for (const r of searchResults) {
                      const key = r.productTmplId ?? `single-${r.id}`;
                      if (!grouped.has(key)) grouped.set(key, []);
                      grouped.get(key)!.push(r);
                    }
                    return Array.from(grouped.entries()).map(([groupKey, items]) => {
                      const isGroup = items.length > 1 && typeof groupKey === 'number';
                      return (
                        <div key={String(groupKey)}>
                          {isGroup && (
                            <div className="px-6 py-2 bg-sky-50 text-xs font-semibold text-sky-700 flex items-center gap-1.5 border-b border-sky-100">
                              <span>🔗 {items.length} varianten</span>
                            </div>
                          )}
                          {items.map((r) => (
                            <button
                              key={r.id}
                              onClick={() => handleSearchResultClick(r)}
                              disabled={variantsLoading}
                              className={`w-full text-left px-6 py-3 hover:bg-green-50 transition-colors flex items-center gap-4 disabled:opacity-50 ${
                                isGroup ? 'pl-10' : ''
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-gray-900 text-sm truncate">{r.name}</div>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {r.attributes && (
                                    <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{r.attributes}</span>
                                  )}
                                  {r.barcode && (
                                    <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{r.barcode}</span>
                                  )}
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                    r.qty_available > 0 ? 'text-green-700 bg-green-100' : 'text-orange-700 bg-orange-100'
                                  }`}>
                                    Voorraad: {r.qty_available}
                                  </span>
                                </div>
                              </div>
                              <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                                {formatEuro(r.list_price)}
                              </div>
                              <svg className="w-5 h-5 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          ))}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Barcode reassign modal (archived product holds barcode) */}
          {barcodeReassign && (
            <div
              className="fixed inset-0 bg-black/40 z-[100] flex items-start justify-center pt-[8vh] px-4"
              onMouseDown={(e) => {
                // Ignore the click that opened the modal (Scan button / form submit fall-through)
                if (Date.now() - reassignOpenedAtRef.current < 400) return;
                if (e.target !== e.currentTarget) return;
                if (!barcodeReassign.working && !barcodeReassign.loadingVariants) {
                  closeBarcodeReassign();
                }
              }}
            >
              <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">
                      {barcodeReassign.archivedProduct
                        ? 'Barcode zit op gearchiveerd product'
                        : 'Barcode toewijzen aan product'}
                    </h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Barcode{' '}
                      <span className="font-mono font-semibold text-gray-700">
                        {barcodeReassign.barcode}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeBarcodeReassign}
                    disabled={barcodeReassign.working}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {barcodeReassign.archivedProduct ? (
                  <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 text-sm text-amber-900">
                    Gearchiveerd:{' '}
                    <span className="font-semibold">{barcodeReassign.archivedProduct.name}</span>
                  </div>
                ) : (
                  <div className="px-6 py-3 bg-sky-50 border-b border-sky-100 text-sm text-sky-900">
                    Geen product met deze barcode gevonden. Zoek het juiste product en kies de
                    variant.
                  </div>
                )}

                {barcodeReassign.step === 'confirm-clear' && (
                  <div className="px-6 py-6 space-y-4">
                    <p className="text-gray-700">
                      Wil je de barcode leegmaken bij dit gearchiveerde product? Daarna kun je hem
                      toewijzen aan de juiste actieve variant.
                    </p>
                    <div className="flex gap-3 justify-end">
                      <button
                        type="button"
                        onClick={closeBarcodeReassign}
                        disabled={barcodeReassign.working}
                        className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Annuleren
                      </button>
                      <button
                        type="button"
                        onClick={handleClearArchivedBarcode}
                        disabled={barcodeReassign.working}
                        className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold disabled:opacity-50"
                      >
                        {barcodeReassign.working ? 'Bezig...' : 'Ja, barcode leegmaken'}
                      </button>
                    </div>
                  </div>
                )}

                {barcodeReassign.step === 'search' && (
                  <>
                    <form
                      onSubmit={handleReassignSearch}
                      className="px-6 py-4 border-b border-gray-100 flex gap-3"
                    >
                      <input
                        ref={reassignSearchRef}
                        type="text"
                        value={barcodeReassign.searchQuery}
                        onChange={(e) =>
                          setBarcodeReassign((prev) =>
                            prev ? { ...prev, searchQuery: e.target.value } : prev
                          )
                        }
                        placeholder="Zoek actief product op naam..."
                        className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        disabled={barcodeReassign.searching || barcodeReassign.loadingVariants}
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={
                          barcodeReassign.searching ||
                          barcodeReassign.loadingVariants ||
                          !barcodeReassign.searchQuery.trim()
                        }
                        className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold disabled:opacity-50"
                      >
                        {barcodeReassign.searching ? 'Zoeken...' : 'Zoeken'}
                      </button>
                    </form>
                    <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                      {barcodeReassign.loadingVariants && (
                        <div className="px-6 py-8 text-center text-gray-500">
                          Varianten laden...
                        </div>
                      )}
                      {!barcodeReassign.loadingVariants &&
                        barcodeReassign.searchResults.length === 0 && (
                          <div className="px-6 py-8 text-center text-gray-500 text-sm">
                            Zoek het juiste product. Klik daarna op een resultaat om de variant te
                            kiezen.
                          </div>
                        )}
                      {!barcodeReassign.loadingVariants &&
                        barcodeReassign.searchResults.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleReassignPickProduct(p.id)}
                            className="w-full text-left px-6 py-3 hover:bg-green-50 transition-colors"
                          >
                            <div className="font-medium text-gray-900 text-sm">{p.name}</div>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {p.attributes && (
                                <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                  {p.attributes}
                                </span>
                              )}
                              <span className="text-xs text-gray-500">
                                Voorraad: {p.qty_available} · {formatEuro(p.list_price)}
                              </span>
                            </div>
                          </button>
                        ))}
                    </div>
                  </>
                )}

                {barcodeReassign.step === 'pick-variant' && (
                  <>
                    <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          Kies de juiste variant
                        </p>
                        {barcodeReassign.productName && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {barcodeReassign.productName}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setBarcodeReassign((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  step: 'search',
                                  variants: [],
                                  productName: '',
                                }
                              : prev
                          )
                        }
                        disabled={barcodeReassign.working}
                        className="text-sm text-green-700 hover:text-green-900 disabled:opacity-50"
                      >
                        Terug naar zoeken
                      </button>
                    </div>
                    <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                      {barcodeReassign.working && (
                        <div className="px-6 py-8 text-center text-gray-500">
                          Barcode toewijzen...
                        </div>
                      )}
                      {!barcodeReassign.working &&
                        barcodeReassign.variants.map((v) => {
                          const label = [
                            barcodeReassign.productName || v.name,
                            v.attributes,
                          ]
                            .filter(Boolean)
                            .join(' — ');
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => handleAssignBarcodeToVariant(v.id, label, v.barcode)}
                              className="w-full text-left px-6 py-3 hover:bg-green-50 transition-colors flex items-center gap-4"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-gray-900 text-sm truncate">
                                  {v.name || barcodeReassign.productName}
                                </div>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {v.attributes && (
                                    <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                      {v.attributes}
                                    </span>
                                  )}
                                  {v.barcode && (
                                    <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                      {v.barcode}
                                    </span>
                                  )}
                                  <span
                                    className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                      (v.qty_available ?? 0) > 0
                                        ? 'text-green-700 bg-green-100'
                                        : 'text-orange-700 bg-orange-100'
                                    }`}
                                  >
                                    Voorraad: {v.qty_available ?? 0}
                                  </span>
                                </div>
                              </div>
                              <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded shrink-0">
                                Toewijzen
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Scanned Products List */}
          {scannedProducts.length > 0 && (
            <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  📋 Gescande Producten
                </h2>
                <button
                  onClick={clearAll}
                  className="px-4 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors font-medium"
                >
                  🗑️ Alles wissen
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                  <colgroup>
                    <col />
                    <col className="hidden sm:table-column w-[20%]" />
                    <col className="w-[15%] sm:w-[10%]" />
                    <col className="w-[22%] sm:w-[15%]" />
                    <col className="w-[8%] sm:w-[6%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Product</th>
                      <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700 hidden sm:table-cell">Barcode</th>
                      <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">Prijs</th>
                      <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">Aantal</th>
                      <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {productGroups.map(({ key, products }) => {
                      const isLinkedGroup = products.length > 1 && typeof key === 'number';
                      return (
                        <Fragment key={String(key)}>
                          {isLinkedGroup && (
                            <tr className="bg-sky-50 border-y-2 border-sky-200">
                              <td colSpan={5} className="py-2 px-3 text-sm text-sky-800 font-medium">
                                <span className="inline-flex items-center gap-1.5">
                                  <span aria-hidden>🔗</span>
                                  Productgroep ({products.length} varianten) — naam wijzigen geldt voor alle varianten hieronder
                                </span>
                              </td>
                            </tr>
                          )}
                          {products.map((product) => (
                            <tr
                              key={product.id}
                              className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                                isLinkedGroup ? 'bg-sky-50/50' : ''
                              } ${
                                product.stockStatus === 'success'
                                  ? 'bg-green-50'
                                  : product.stockStatus === 'error'
                                  ? 'bg-red-50'
                                  : product.stockStatus === 'pending'
                                  ? 'bg-yellow-50'
                                  : ''
                              }`}
                            >
                              <td className="py-3 px-2">
                                <input
                                  type="text"
                                  value={product.name}
                                  onChange={(e) => updateField(product.id, 'name', e.target.value)}
                                  className="w-full font-medium text-gray-900 text-sm break-words bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none py-0.5 transition-colors"
                                  title={isLinkedGroup ? 'Naam geldt voor alle varianten in deze groep' : 'Klik om naam te bewerken (alleen voor afdruk)'}
                                />
                                {isLinkedGroup && (
                                  <p className="text-xs text-sky-600 mt-0.5 font-medium">
                                    Naam geldt voor alle {products.length} varianten
                                  </p>
                                )}
                                <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            <input
                              type="text"
                              value={product.attributes || ''}
                              onChange={(e) => updateField(product.id, 'attributes', e.target.value)}
                              placeholder="Maat..."
                              className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-transparent hover:border-blue-300 focus:border-blue-500 focus:outline-none w-20 transition-colors"
                              title="Klik om maat te bewerken (alleen voor afdruk)"
                            />
                            {product.sizeRange && (
                              <span className="text-xs font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                                {product.sizeRange}
                              </span>
                            )}
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                              product.qty_available > 0
                                ? 'text-green-700 bg-green-100'
                                : product.qty_available === 0
                                ? 'text-orange-700 bg-orange-100'
                                : 'text-red-700 bg-red-100'
                            }`}>
                              Voorraad: {product.qty_available}
                            </span>
                          </div>
                          {product.stockStatus === 'success' && (
                            <span className="text-xs text-green-600 font-medium">✅ Voorraad aangepast</span>
                          )}
                          {product.stockStatus === 'error' && (
                            <span className="text-xs text-red-600 font-medium">❌ {product.stockError || 'Fout'}</span>
                          )}
                          {product.stockStatus === 'pending' && (
                            <span className="text-xs text-yellow-600 font-medium">⏳ Bezig...</span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-sm text-gray-500 font-mono hidden sm:table-cell">
                          {product.barcode || '-'}
                        </td>
                        <td className="py-3 px-2 text-sm text-right font-semibold text-gray-900">
                          {formatEuro(product.list_price)}
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => updateCount(product.id, product.count - 1)}
                              disabled={product.count <= 1}
                              className="w-7 h-7 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={product.count}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (val >= 1) updateCount(product.id, val);
                              }}
                              className="w-12 text-center border border-gray-300 rounded py-1 text-sm font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button
                              onClick={() => updateCount(product.id, product.count + 1)}
                              className="w-7 h-7 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold transition-colors text-sm"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <button
                            onClick={() => removeProduct(product.id)}
                            className="text-red-400 hover:text-red-600 transition-colors"
                            title="Verwijderen"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          {scannedProducts.length > 0 && (
            <div className="bg-white shadow-xl rounded-2xl p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">⚡ Acties</h2>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={handleAdjustStock}
                  disabled={adjustingStock || scannedProducts.length === 0}
                  className="flex-1 px-6 py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all text-lg flex items-center justify-center gap-2"
                >
                  {adjustingStock ? (
                    <>⏳ Voorraad aanpassen...</>
                  ) : (
                    <>📦 Voorraad Aanpassen</>
                  )}
                </button>
                <button
                  onClick={handlePrintLabels}
                  disabled={printingLabels || scannedProducts.length === 0}
                  className="flex-1 px-6 py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all text-lg flex items-center justify-center gap-2"
                >
                  {printingLabels ? (
                    <>⏳ Labels versturen…</>
                  ) : (
                    <>🖨️ Labels Afdrukken ({totalLabels})</>
                  )}
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-3">
                💡 {labelFormat === 'small'
                  ? 'Klein formaat (25×25mm): alleen prijs en variant/maatreeks. '
                  : ''}
                Labels: {printer === 'zebra' ? 'Zebra (51×25mm)' : 'Dymo (25×54mm)'}.
                {printer === 'zebra' && labelFormat === 'normal'
                  ? ' Zebra 51×25 mm. Direct naar printer: start in een terminal "npm run print-zebra", daarna gaat "Labels afdrukken" direct naar de Zebra (zoals echo | lpr -o raw). Zonder bridge opent het browser-printvenster.'
                  : ` Selecteer je ${printer === 'zebra' ? 'Zebra' : 'Dymo'} printer in het printvenster.`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
