/* eslint-disable */
module.exports = {
    displayName: "system",
    transform: {
        "\\.[jt]sx?$": "esbuild-jest"
    },
    moduleFileExtensions: ["ts", "js"],
    roots: [
        "<rootDir>/src"
    ],
    testMatch: [
        "**/__tests__/**/*.+(ts|tsx|js)",
        "**/?(*.)+(spec|test).+(ts|tsx|js)"
    ]
};