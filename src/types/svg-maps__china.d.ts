declare module "@svg-maps/china" {
  const map: {
    viewBox?: string;
    locations: Array<{
      id: string;
      name: string;
      path: string;
    }>;
  };
  export default map;
}
