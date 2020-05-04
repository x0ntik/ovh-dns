FROM node:14

WORKDIR /app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install

COPY src src

ENV APP_KEY 'app_key'
ENV APP_SECRET 'app_secret'
ENV APP_CONSUMER_KEY 'app_consumer_key'

ENTRYPOINT [ "node", "src/index.js" ]
