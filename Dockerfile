# ✅ 1. Use official Node.js 20 LTS base image
FROM node:20

# ✅ 2. Set working directory inside container
WORKDIR /app

# ✅ 3. Copy only package files first (better caching)
COPY package*.json ./

# ✅ 4. Install dependencies
RUN npm install --force

# ✅ 5. Copy all remaining project files
COPY . .

# ✅ 6. Expose your app's port
EXPOSE 3000

# ✅ 7. Run app with npm start
CMD ["npm","start"]