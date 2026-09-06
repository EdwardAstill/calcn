import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["public/r/**", "dist/**", "release/**", "app/styles/build.css"] },
  ...tseslint.configs.recommended,
)
