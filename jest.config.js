/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
      // '^.+\\.[tj]sx?$' to process ts,js,tsx,jsx with `ts-jest`
      // '^.+\\.m?[tj]sx?$' to process ts,js,tsx,jsx,mts,mjs,mtsx,mjsx with `ts-jest`
      '^.+\\.ts$': [
        'ts-jest',
        {
          diagnostics: {
            ignoreCodes: [151001],
          },
        },
      ],
    },
};