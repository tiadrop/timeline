/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  moduleNameMapper: {
      "(.+)\\.js": "$1", // Faz you legend <3
  },
  transform: {
      // '^.+\\.[tj]sx?$' to process ts,js,tsx,jsx with `ts-jest`
      // '^.+\\.m?[tj]sx?$' to process ts,js,tsx,jsx,mts,mjs,mtsx,mjsx with `ts-jest`
      '^.+\\.[tj]s$': [
        'ts-jest',
        {
          diagnostics: {
            ignoreCodes: [151001],
          },
        },
      ],
    },
};