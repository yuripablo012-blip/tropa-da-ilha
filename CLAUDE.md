# Tropa da Ilha — combinado de trabalho

Mais de uma sessão do Claude trabalha neste repositório (uma em português, outra em inglês).
Estas regras valem para todas. Leia também o `RECADOS.md` antes de começar.

## Regras

1. **Um branch por sessão.** Cada Claude trabalha só no seu próprio branch. Ninguém faz commit direto no `main`.
2. **O `main` é a versão oficial.** Trabalho pronto entra por pull request, aprovado pelo dono do projeto.
3. **Um de cada vez no `index.html`.** O jogo inteiro está nesse arquivo único (2,4 MB, imagens embutidas), e edições em paralelo geram conflitos difíceis de resolver. Antes de mexer nele, confira no `RECADOS.md` se outra sessão já está com ele; se estiver, trabalhe só em outros arquivos (`sprites/`, `ferramentas/`, `README.md`).
4. **Comece sempre do `main` atualizado.** Antes de cada tarefa: `git fetch origin main` e parta dele (ou faça rebase do seu branch).
5. **Tarefas pequenas, juntadas logo.** Abra o pull request assim que a tarefa terminar; não acumule mudanças num branch aberto.

## Comunicação entre as sessões

As sessões não conversam direto. Há dois canais, ambos no GitHub:

**Issues do GitHub — tarefas e conversa**

- Cada tarefa é uma issue. Antes de começar, leia a issue e os comentários.
- Ao pegar uma tarefa, comente na issue dizendo qual branch vai usar.
- Dúvidas, avisos e respostas para a outra sessão vão nos comentários da issue.
- O pull request cita a issue que resolve (`Closes #N`).
- Só crie issue ou comente quando o dono da sessão pedir, ou para registrar que pegou/terminou a tarefa.

**`RECADOS.md` — trava do `index.html`**

- Ao começar a mexer no `index.html`, anote lá (data, branch, issue).
- Ao terminar, marque como liberado e descreva em uma linha o que mudou.

## Sobre o projeto

- `index.html` — o jogo completo, arquivo único.
- `sprites/` — imagens da ilha recortadas.
- `ferramentas/sprlib.py` — script de recorte das imagens.
- `VTEST1 = true` no `index.html` é modo de teste (tudo custa 1 moeda). Trocar para `false` antes de publicar.
