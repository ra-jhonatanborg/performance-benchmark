# performance-benchmark

## Rodar TST/EVO no CI (Cloudflare WARP)

Os ambientes TST e EVO só são acessíveis na VPN. Para o workflow **Publicar reclamação** rodar contra TST ou EVO no GitHub Actions, use o Cloudflare WARP (Zero Trust) com **Service Token**.

### Pré-requisito

Sua organização precisa usar **Cloudflare Zero Trust** (WARP for Teams). O WARP gratuito (consumer) não oferece Service Token para CI.

### Passos

1. **Criar um Service Token** (uma vez)
   - Em [Cloudflare One](https://one.dash.cloudflare.com/) → **Access** → **Service credentials** → **Service Tokens** → **Create Service Token**.
   - Defina nome (ex.: `CI GitHub Actions`) e duração.
   - **Copie e guarde** o **Client ID** e **Client Secret** (o secret só é exibido uma vez).

2. **Liberar inscrição do dispositivo com o token**
   - **Team & Resources** → **Devices** → aba **Management** → **Device enrollment permissions** → **Manage**.
   - Crie uma regra com **Action** = `Service Auth`, **Selector** = `Service Token`, e inclua o token criado.
   - Salve e adicione a política às permissões de enrollment.

3. **Configurar Secrets no repositório**
   - **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
   - Crie:
     - `CLOUDFLARE_WARP_ORGANIZATION` = nome da sua organização Zero Trust (ex.: `minha-empresa`).
     - `CLOUDFLARE_AUTH_CLIENT_ID` = Client ID do Service Token.
     - `CLOUDFLARE_AUTH_CLIENT_SECRET` = Client Secret do Service Token.

4. **Rodar o workflow**
   - Ao disparar o workflow, escolha ambiente **tst** ou **evo**.
   - O job vai instalar e conectar o WARP antes de rodar o teste; o tráfego do runner passa pela sua rede Zero Trust e consegue acessar TST/EVO.

Referência: [WARP on headless Linux](https://developers.cloudflare.com/cloudflare-one/tutorials/warp-on-headless-linux/).

### Não tenho acesso ao Zero Trust (Access / Service Tokens)

Se você não vê **Access** → **Service credentials** no Cloudflare One, só um **administrador** do Zero Trust pode criar o Service Token. Você pode enviar algo assim:

---

**Assunto:** Service Token para CI (GitHub Actions) — WARP

Preciso de um **Service Token** do Cloudflare Zero Trust para rodar testes no GitHub Actions contra ambientes que estão atrás da VPN (WARP).

1. No [Cloudflare One](https://one.dash.cloudflare.com/) → **Access** → **Service credentials** → **Service Tokens** → **Create Service Token** (nome ex.: "CI GitHub Actions", duração conforme política).
2. Em **Device enrollment permissions** (**Team & Resources** → **Devices** → **Management**), permitir esse token com regra **Service Auth**.
3. Me enviar (por canal seguro) o **Client ID** e o **Client Secret** — ou adicionar no repositório como secrets: `CLOUDFLARE_WARP_ORGANIZATION` (ID da organização na URL do One), `CLOUDFLARE_AUTH_CLIENT_ID`, `CLOUDFLARE_AUTH_CLIENT_SECRET`.

Doc: https://developers.cloudflare.com/cloudflare-one/tutorials/warp-on-headless-linux/

---

Enquanto os secrets não forem configurados, o workflow pode usar ambiente **prod** no CI; se alguém escolher **tst** ou **evo** sem os secrets, o teste será **skipped** com mensagem explicando.
