FROM node:20-alpine

WORKDIR /app

# Install dependencies for canvas/puppeteer if needed in the future, 
# but for now we just need basic node and curl for healthchecks
RUN apk add --no-cache curl

COPY package*.json ./
RUN npm install

COPY . .

# We use tsx to run the worker in development/production for simplicity 
# since we're in a containerized environment and building a full standalone 
# build for the worker is more complex.
CMD ["npx", "tsx", "worker/index.ts"]
