import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async () => {
  // Default to zh, can be overridden by cookie/header
  const locale = "zh";
  return {
    locale,
    messages: (await import(`./${locale}.json`)).default,
  };
});
