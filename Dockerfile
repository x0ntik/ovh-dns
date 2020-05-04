FROM node:14

WORKDIR /app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install

COPY src src

ENTRYPOINT [ "node", "src/index.js" ]
