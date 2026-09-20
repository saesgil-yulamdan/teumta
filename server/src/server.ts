import { app } from './app';
import { env } from './config/env';
import { configureOutboundProxy } from './external/common/outbound-proxy';

function bootstrap() {
  configureOutboundProxy();

  app.listen(env.PORT, (error?: Error) => {
    if (error) {
      console.error(`Failed to listen on port ${env.PORT}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    console.log(`teumta-server listening on port ${env.PORT}`);
  });
}

bootstrap();
