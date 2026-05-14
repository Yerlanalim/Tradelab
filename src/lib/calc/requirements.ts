import { Incoterms } from "../api/calc";

export type FieldName = 
  | 'dest_country' 
  | 'incoterms' 
  | 'goods_value' 
  | 'currency' 
  | 'hs_code' 
  | 'weight_gross_kg'
  | 'origin_country'
  | 'origin_city'
  | 'dest_city'
  | 'mode_preference'
  | 'invoice_includes_freight';

export interface RequirementsResult {
    requiredFields: FieldName[];
    visibleFields: FieldName[]; // Explicitly allowed to be shown (others hidden or logic handled via sections)
    hints: Record<string, string>;
    isEscalation?: boolean; // For DDP
}

export const ALL_FIELDS: FieldName[] = [
    'dest_country', 'incoterms', 'goods_value', 'currency', 'hs_code', 
    'weight_gross_kg', 'origin_country', 'origin_city', 'dest_city', 
    'mode_preference', 'invoice_includes_freight'
];

/**
 * Returns requirements for the form based on Incoterms and current state.
 * @param incoterms Selected Incoterms
 * @param formData Current form data (needed for dependencies like invoice_includes_freight)
 */
export function getRequirements(
    incoterms: Incoterms,
    formData?: { invoice_includes_freight?: 'yes' | 'no' | 'unknown' }
): RequirementsResult {
    
    // Base required for EVERY request
    const baseRequired: FieldName[] = ['dest_country', 'goods_value', 'currency', 'incoterms'];
    const baseVisible: FieldName[] = ['dest_country', 'goods_value', 'currency', 'incoterms', 'hs_code', 'weight_gross_kg']; // Weight always visible

    switch (incoterms) {
        case 'CIF':
        case 'CIP': // Treat CIP same as CIF for MVP logic if supported
            return {
                requiredFields: [...baseRequired], // Weight is optional for calculation (if backend allows defaults?) 
                // User said: "required only for FOB/EXW/FCA...". 
                // So for CIF, weight is technically optional validation-wise, 
                // though backend might need it for precision, usually CIF implies freight is paid to port.
                // We trust the user's rule: "weight required only for FOB...".
                visibleFields: [...baseVisible],
                hints: {
                    weight_gross_kg: "Optional for CIF (but recommended for duties)",
                    incoterms: "Incoterms: Cost, Insurance & Freight (Base price includes delivery to border)"
                }
            };

        case 'FOB':
        case 'EXW':
        case 'FCA':
            return {
                requiredFields: [...baseRequired, 'weight_gross_kg'],
                visibleFields: [...baseVisible, 'origin_country', 'mode_preference', 'origin_city'],
                hints: {
                    weight_gross_kg: "Required for transport calculation",
                    origin_country: "Required for pickup",
                    mode_preference: "Preferred transport mode"
                }
            };

        case 'DAP':
             const invoiceIncludesFreight = formData?.invoice_includes_freight === 'yes';
             
             const dapRequired: FieldName[] = [...baseRequired, 'invoice_includes_freight'];
             if (!invoiceIncludesFreight) {
                 dapRequired.push('weight_gross_kg');
             }

             const dapVisible: FieldName[] = [...baseVisible, 'invoice_includes_freight'];
             if (!invoiceIncludesFreight) {
                 dapVisible.push('origin_country', 'mode_preference', 'origin_city');
             }

             return {
                 requiredFields: dapRequired,
                 visibleFields: dapVisible,
                 hints: {
                     invoice_includes_freight: "Does your invoice amount already include the shipping cost?",
                     weight_gross_kg: invoiceIncludesFreight ? "Optional" : "Required to calculate shipping"
                 }
             };

        case 'DDP':
            return {
                requiredFields: [...baseRequired], // Minimal validation to allow "Calculate" -> Show warning
                  visibleFields: [...baseVisible, 'origin_country', 'mode_preference'],
                hints: {
                     incoterms: "Delivery Duty Paid: Requires manual verification."
                },
                isEscalation: true
            };
            
        default:
            return {
                requiredFields: [...baseRequired],
                visibleFields: [...baseVisible],
                hints: {}
            };
    }
}
