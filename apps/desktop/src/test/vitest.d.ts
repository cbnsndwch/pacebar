// Wire @testing-library/jest-dom matcher types (toBeInTheDocument, toBeChecked,
// ...) into vitest's Assertion interface for the type-checker. setup.ts imports
// "@testing-library/jest-dom/vitest" at runtime to register the matchers; this
// reference is the compile-time counterpart. Required under pnpm's isolated
// node_modules so the augmentation resolves regardless of hoist layout.
/// <reference types="@testing-library/jest-dom/vitest" />
