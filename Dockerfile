FROM node:26-alpine AS base
WORKDIR /app

# Install pnpm globally on node:26-alpine
RUN npm install -g pnpm@12.14.0

# Install dependencies inside Docker using pnpm
COPY package.json pnpm-workspace.yaml ./
RUN pnpm install

# Copy project source files
COPY . .

# Run TypeScript compile-time check, ESLint, and Vitest unit + static analysis tests inside Docker
RUN pnpm run typecheck && pnpm run lint && pnpm run test:unit

# Build static & hybrid Next.js pages
RUN pnpm run build

EXPOSE 3000
CMD ["pnpm", "run", "start"]
