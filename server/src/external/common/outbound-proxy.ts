import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

/**
 * Cloudtype 아웃바운드 IP 우회 등으로 HTTPS_PROXY/HTTP_PROXY가 주어질 때
 * Node 기본 fetch가 이를 무시하므로 undici EnvHttpProxyAgent를 전역으로 붙인다.
 * 프록시 env가 없으면 no-op에 가깝게 동작한다.
 */
export function configureOutboundProxy(): void {
  const httpsProxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  const httpProxy = process.env.HTTP_PROXY ?? process.env.http_proxy;
  if (!httpsProxy && !httpProxy) {
    return;
  }

  setGlobalDispatcher(new EnvHttpProxyAgent());
  console.log(
    `outbound proxy enabled (HTTPS_PROXY=${httpsProxy ? 'set' : 'unset'}, HTTP_PROXY=${httpProxy ? 'set' : 'unset'})`,
  );
}
