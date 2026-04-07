/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  moduleNameMapper: {
      "(.+)\\.js": "$1",
  },
  transform: {
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