# TODO: Shared Types Package

## Plan for @slack-archive/types

### 1. Package Structure
```
packages/
└── types/
    ├── src/
    │   ├── index.ts
    │   ├── channel.ts
    │   ├── message.ts
    │   └── user.ts
    ├── package.json
    └── tsconfig.json
```

### 2. Key Types to Share
- Channel interfaces
- Message and thread interfaces
- User profiles
- Emoji definitions
- File attachments
- Reaction types
- Archive metadata types
- Search index types

### 3. Implementation Steps
1. Create types package structure
2. Extract existing types from:
   - archive/src/types
   - backend/src/types
   - frontend/src/types
3. Consolidate duplicate definitions
4. Add TypeScript declarations
5. Set up workspace dependencies
6. Update imports in all modules

### 4. Benefits
- Single source of truth for types
- Consistent interfaces across modules
- Better IDE support
- Easier refactoring
- Reduced code duplication

### 5. Dependencies Required
```json
{
  "devDependencies": {
    "typescript": "^4.7.4",
    "@types/node": "^17.0.5"
  }
}
```

### 6. Integration Points
- Archive module type imports
- Backend API interfaces
- Frontend component props
- Search functionality types
- File handling interfaces

### Notes
- Keep types minimal and focused
- Add JSDoc comments for better IDE hints
- Consider breaking changes carefully
- Version types package separately