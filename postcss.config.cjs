module.exports = {
  plugins: {
    "@tailwindcss/postcss": {},
    "./src/utils/styles/postcss-rename-custom-props.cjs": {
      fromPrefix: "--tw-",
      toPrefix: "--rf-tw-",
    },
    "postcss-rem-to-responsive-pixel": {
      rootValue: 16,
      propList: ["*"],
      transformUnit: "px",
    },
  },
}
