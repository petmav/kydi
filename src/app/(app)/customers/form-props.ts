import { countryOptions, currencyOptions } from "@/lib/intl-data";
import { getCustomFields } from "@/lib/custom-fields";
import { getBaseUrl } from "@/lib/url";
import type { CompanyContext } from "@/lib/auth/context";

export async function customerFormProps(ctx: CompanyContext) {
  const fields = await getCustomFields(ctx.companyId, "Customer");
  return {
    currencies: currencyOptions(),
    countries: countryOptions(),
    portalUrl: `${await getBaseUrl()}/portal/${ctx.company.slug}/login`,
    customFields: fields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      placeholder: f.placeholder,
      options: f.options,
      defaultAnswer: f.defaultAnswer,
      isRequired: f.isRequired,
    })),
  };
}
