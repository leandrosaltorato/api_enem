# Banco de Questões ENEM

Front end em HTML, CSS e JavaScript puros para a [API ENEM](https://docs.enem.dev/introduction). Lista as provas anteriores, mostra as questões com imagens e alternativas e confere as respostas com o gabarito. Tema branco e azul-escuro, responsivo.

## Funcionalidades

- Escolha da prova por ano (lista vinda da API, da mais recente para a mais antiga).
- Filtro por área (Linguagens, Matemática, Ciências Humanas, Ciências da Natureza) e por idioma estrangeiro (inglês ou espanhol).
- Questões com contexto em Markdown, imagens e alternativas com texto ou imagem, em páginas de 10.
- Ao clicar numa alternativa, o resultado aparece na hora (verde para acerto, vermelho para erro, com o gabarito). Também é possível ver o gabarito sem responder e refazer a questão.
- Cartão-resposta ao lado, com acertos, erros e gabaritos vistos. Clicar num número leva até a questão.
- As respostas ficam salvas no `localStorage` do navegador, separadas por prova.

## Estrutura

```
enem-front/
├── index.html   
├── style.css    
├── script.js    
└── README.md
```

## Como rodar

Não há dependências nem etapa de build. Os três arquivos precisam ficar na mesma pasta. Use um servidor local qualquer:

- **VS Code:** extensão Live Server, botão "Go Live" com a pasta do projeto aberta.

A página precisa de internet para acessar a API e as fontes do Google Fonts.

## Endpoints usados

Base: `https://api.enem.dev/v1`

| Método | Rota                                               | Uso                                                    |
| ------ | -------------------------------------------------- | ------------------------------------------------------ |
| GET    | `/exams`                                           | Lista as provas, com disciplinas e idiomas de cada uma |
| GET    | `/exams/{year}/questions?limit=&offset=&language=` | Lista as questões de uma prova, com paginação          |

## Limite de requisições

A API aceita 1 requisição por segundo nos endpoints sem cache. Por isso o `script.js`:

- usa uma fila que espaça as chamadas em pelo menos 1,1 s;
- tenta de novo quando recebe `429`, respeitando o `Retry-After`;
- carrega a prova em lotes de 50 questões (cai para 20 ou 10 se a API recusar o tamanho) e mostra as primeiras assim que chegam;
- guarda em memória as provas já carregadas, então trocar de filtro de idioma ou voltar a uma prova não repete as chamadas.

A API não filtra por disciplina, então esse filtro é aplicado no navegador depois que a prova foi baixada.

## Problemas comuns

- **404 em `script.js` ou `style.css`:** os arquivos não estão na mesma pasta do `index.html`, ou foram salvos com outro nome (por exemplo `script (1).js`). O servidor devolve uma página HTML de erro e o navegador reclama do tipo do arquivo.
- **"Não foi possível carregar":** falha de rede ou limite da API. Use o botão "Tentar de novo".
- **Respostas sumiram:** o `localStorage` é por navegador e por endereço. Mudar a porta do servidor, por exemplo, começa do zero.

