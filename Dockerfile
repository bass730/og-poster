# Specify base image
FROM node:21-alpine

# Specify working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port 8080
EXPOSE 5270

# Run the app
CMD ["npm", "start"]