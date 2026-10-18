import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import * as Accordion from '@radix-ui/react-accordion';
import * as Dialog from '@radix-ui/react-dialog';
import {
  SUPPORT_EMAIL,
  APP_VERSION,
  APP_DOWNLOAD_URL,
  isAppDownloadAvailable,
} from '../config/app';
import { normalize } from '../utils/format';
import { PageContainer } from '../components/ui/PageContainer';
import { TERMS_MARKDOWN } from '../legal/terms';
import { PRIVACY_MARKDOWN } from '../legal/privacy';
import { TERMS_VERSION, PRIVACY_VERSION } from '../legal/versions';
import { LegalMarkdown } from '../components/LegalMarkdown';

interface TopicItem {
  id: string;
  title: string;
  subtitle: string;
}

interface FaqItem {
  id: string;
  topicId: string;
  question: string;
  answer: string;
  featured?: boolean;
}

const TOPICS: TopicItem[] = [
  { id: 'comecando', title: 'Começando', subtitle: 'Primeiros passos' },
  {
    id: 'contas',
    title: 'Contas e cartões',
    subtitle: 'Saldo, limite e fatura',
  },
  { id: 'fixas', title: 'Fixas', subtitle: 'Lançar e dividir' },
  { id: 'relatorios', title: 'Relatórios', subtitle: 'Nota e acerto do mês' },
  { id: 'importar', title: 'Importar', subtitle: 'CSV e OFX' },
  {
    id: 'seguranca',
    title: 'Conta e segurança',
    subtitle: 'Senha, família e exclusão',
  },
];

const FAQS: FaqItem[] = [
  {
    id: 'faq-1',
    topicId: 'fixas',
    question: 'Como dividir uma fixa com outra pessoa?',
    answer:
      'Abra a fixa, toque em Editar e escolha as pessoas na seção Dividir entre pessoas. O Wynd mostra a sua parte em Fixas e no acerto do mês.',
    featured: true,
  },
  {
    id: 'faq-2',
    topicId: 'importar',
    question: 'Meu extrato do banco repetiu lançamentos. E agora?',
    answer:
      'Na tela Importar, o Wynd compara data, descrição e valor com o que já foi lançado e marca os repetidos como Já existe para não importar duas vezes.',
    featured: true,
  },
  {
    id: 'faq-3',
    topicId: 'seguranca',
    question: 'Como mudar de família?',
    answer:
      'Em Configurações, na seção Mudar de família, digite o código de convite da outra família e peça para mudar. A mudança vale depois que o administrador aprovar.',
    featured: true,
  },
  {
    id: 'faq-4',
    topicId: 'comecando',
    question: 'Posso usar o Wynd no celular?',
    answer:
      'Sim. Use o app do Wynd no Android ou acesse pelo navegador do celular com a mesma conta. Suas contas, cartões, fixas e metas aparecem iguais no celular e no site.',
    featured: true,
  },
  {
    id: 'faq-5',
    topicId: 'comecando',
    question: 'Como lanço uma despesa?',
    answer:
      'Em Transações ou no Painel, clique em Nova transação, escolha Despesa, preencha valor, categoria e conta e salve.',
  },
  {
    id: 'faq-6',
    topicId: 'comecando',
    question: 'Como troco o mês que estou vendo?',
    answer:
      'No topo do Painel, Transações, Cartões, Fixas ou Relatórios, use as setas ao lado do nome do mês ou clique no mês para escolher outro.',
  },
  {
    id: 'faq-7',
    topicId: 'contas',
    question: 'Como marco uma fatura como paga?',
    answer:
      'Abra Cartões, escolha o cartão, selecione a conta de pagamento e clique em Marcar como paga.',
  },
  {
    id: 'faq-8',
    topicId: 'contas',
    question: 'O saldo da conta está diferente do banco. E agora?',
    answer:
      'Confira o saldo inicial em Contas e veja se há lançamentos duplicados. Transferências entre contas não contam como despesa do mês.',
  },
  {
    id: 'faq-9',
    topicId: 'fixas',
    question: 'O que acontece se eu excluir uma fixa?',
    answer:
      'Ela deixa de cobrar e de avisar daí em diante. O que já foi lançado nos meses anteriores continua salvo no seu histórico.',
  },
  {
    id: 'faq-10',
    topicId: 'relatorios',
    question: 'O que é a Nota do mês?',
    answer:
      'É um resumo visual de quanto da sua renda ficou comprometido com despesas no mês selecionado.',
  },
  {
    id: 'faq-11',
    topicId: 'importar',
    question: 'Quais arquivos posso importar?',
    answer:
      'Extratos em CSV ou OFX do Nubank, Itaú, Inter, Bradesco, C6 e planilhas de despesas em Excel.',
  },
  {
    id: 'faq-12',
    topicId: 'seguranca',
    question: 'Como faço backup dos meus dados?',
    answer:
      'Em Configurações, no quadro Backup, clique em Exportar tudo em Excel ou Baixar cópia JSON.',
  },
];

export function Help() {
  const [search, setSearch] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [infoModal, setInfoModal] = useState<
    'termos' | 'privacidade' | 'sobre' | null
  >(null);

  const filteredFaqs = useMemo(() => {
    const q = normalize(search);
    return FAQS.filter((item) => {
      if (selectedTopic && item.topicId !== selectedTopic) return false;
      if (!q) return true;
      return (
        normalize(item.question).includes(q) ||
        normalize(item.answer).includes(q)
      );
    });
  }, [search, selectedTopic]);

  const mailtoHref = useMemo(() => {
    const subject = encodeURIComponent(`Ajuda Wynd (Versão ${APP_VERSION})`);
    const body = encodeURIComponent(
      'Olá equipe Wynd,\n\nPreciso de ajuda com:\n'
    );
    return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  }, []);

  const showApkCard = isAppDownloadAvailable();

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto space-y-5">
      {/* Search Bar */}
      <div className="relative">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Procure uma dúvida, por exemplo dividir despesa, importar extrato"
          aria-label="Procure uma dúvida"
          className="w-full min-h-[48px] pl-11 pr-4 py-3 rounded-[20px] bg-card border border-border text-sm text-ink placeholder:text-muted outline-none focus:border-pri shadow-xs transition-colors"
        />
      </div>

      {/* 6 Topic Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {TOPICS.map((topic) => {
          const isActive = selectedTopic === topic.id;
          return (
            <button
              key={topic.id}
              type="button"
              onClick={() =>
                setSelectedTopic((prev) =>
                  prev === topic.id ? null : topic.id
                )
              }
              className={`rounded-[20px] bg-card border p-4 text-left transition-all shadow-xs ${
                isActive
                  ? 'border-pri ring-1 ring-pri/30'
                  : 'border-border hover:border-pri/40'
              }`}
            >
              <div className="font-display text-sm font-bold text-ink">
                {topic.title}
              </div>
              <div className="text-xs text-muted mt-0.5">{topic.subtitle}</div>
            </button>
          );
        })}
      </div>

      {/* Perguntas frequentes (Radix Accordion) */}
      <div className="rounded-[24px] bg-card border border-border p-5 md:p-6 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold text-ink">
            Perguntas frequentes
          </h2>
          {selectedTopic && (
            <button
              type="button"
              onClick={() => setSelectedTopic(null)}
              className="text-xs font-bold text-pri hover:underline"
            >
              Ver todas
            </button>
          )}
        </div>

        {filteredFaqs.length === 0 ? (
          <p className="text-xs text-muted py-6 text-center">
            Nenhuma pergunta encontrada para sua busca.
          </p>
        ) : (
          <Accordion.Root
            type="multiple"
            defaultValue={['faq-1']}
            className="divide-y divide-border"
          >
            {filteredFaqs.map((faq) => (
              <Accordion.Item key={faq.id} value={faq.id} className="py-1">
                <Accordion.Header>
                  <Accordion.Trigger className="group w-full py-3 flex items-center justify-between gap-3 text-left text-sm font-bold text-ink hover:text-pri transition-colors">
                    <span>{faq.question}</span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-muted shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content className="pb-3.5 text-xs text-muted leading-relaxed">
                  {faq.answer}
                </Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        )}
      </div>

      {/* Bottom Cards: Não achou? & Wynd no Android */}
      <div
        className={`grid grid-cols-1 ${
          showApkCard ? 'md:grid-cols-2' : ''
        } gap-4`}
      >
        <div className="rounded-[24px] bg-card border border-border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div>
            <h3 className="font-display text-base font-bold text-ink">
              Não achou?
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Fale com a gente e conte o que aconteceu.
            </p>
          </div>
          <a
            href={mailtoHref}
            className="px-4 min-h-[44px] rounded-[18px] bg-fab text-fabIcon font-bold text-xs md:text-sm inline-flex items-center justify-center shrink-0 hover:opacity-95 transition-opacity"
          >
            Enviar mensagem
          </a>
        </div>

        {showApkCard && (
          <div className="rounded-[24px] bg-card border border-border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div>
              <h3 className="font-display text-base font-bold text-ink">
                Wynd no Android
              </h3>
              <p className="text-xs text-muted mt-0.5">
                O mesmo Wynd no celular, sincronizado com o site.
              </p>
            </div>
            <a
              href={APP_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 min-h-[44px] rounded-[18px] bg-priSoft text-priInk font-bold text-xs md:text-sm inline-flex items-center justify-center shrink-0 hover:opacity-90 transition-opacity"
            >
              Baixar APK
            </a>
          </div>
        )}
      </div>

      {/* Footer Links */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setInfoModal('termos')}
            className="hover:text-ink font-semibold transition-colors"
          >
            Termos de uso
          </button>
          <button
            type="button"
            onClick={() => setInfoModal('privacidade')}
            className="hover:text-ink font-semibold transition-colors"
          >
            Privacidade
          </button>
          <button
            type="button"
            onClick={() => setInfoModal('sobre')}
            className="hover:text-ink font-semibold transition-colors"
          >
            Sobre
          </button>
        </div>
        <span className="font-semibold">Versão {APP_VERSION}</span>
      </div>

      {/* Modal Termos / Privacidade / Sobre */}
      <Dialog.Root
        open={Boolean(infoModal)}
        onOpenChange={(open) => {
          if (!open) setInfoModal(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[9998] bg-black/55 backdrop-blur-xs" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[9999] w-[calc(100vw-24px)] max-w-[460px] max-h-[85vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-[26px] bg-card border border-border p-6 text-ink shadow-2xl focus:outline-none space-y-4">
            <div className="flex items-center justify-between">
              <Dialog.Title className="font-display text-lg font-bold text-ink">
                {infoModal === 'termos'
                  ? 'Termos de uso'
                  : infoModal === 'privacidade'
                    ? 'Política de privacidade'
                    : 'Sobre o Wynd'}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Fechar"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-neutral"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </Dialog.Close>
            </div>

            <Dialog.Description className="sr-only">
              Informações institucionais e legais do Wynd.
            </Dialog.Description>

            {infoModal === 'termos' && (
              <div className="space-y-3 text-xs text-muted leading-relaxed">
                <div className="flex items-center justify-between gap-2 pb-1 border-b border-border">
                  <span className="font-semibold text-ink">
                    Versão {TERMS_VERSION}
                  </span>
                  <Link
                    to="/termos"
                    className="font-bold text-priInk hover:underline"
                  >
                    Abrir página completa
                  </Link>
                </div>
                <LegalMarkdown markdown={TERMS_MARKDOWN} compact />
              </div>
            )}

            {infoModal === 'privacidade' && (
              <div className="space-y-3 text-xs text-muted leading-relaxed">
                <div className="flex items-center justify-between gap-2 pb-1 border-b border-border">
                  <span className="font-semibold text-ink">
                    Versão {PRIVACY_VERSION}
                  </span>
                  <Link
                    to="/privacidade"
                    className="font-bold text-priInk hover:underline"
                  >
                    Abrir página completa
                  </Link>
                </div>
                <LegalMarkdown markdown={PRIVACY_MARKDOWN} compact />
              </div>
            )}

            {infoModal === 'sobre' && (
              <div className="space-y-3 text-xs text-muted leading-relaxed">
                <div className="rounded-[18px] bg-priSoft p-4 text-priInk">
                  <div className="font-display text-base font-bold">
                    Wynd · Versão {APP_VERSION}
                  </div>
                  <div className="mt-1">
                    Seu dinheiro, no seu ritmo. O mesmo Wynd no app e no site, com a mesma conta.
                  </div>
                </div>
                <div>
                  <div className="font-bold text-ink mb-1">
                    Novidades desta versão
                  </div>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Visual novo, claro e escuro</li>
                    <li>Fixas e assinaturas, com divisão entre pessoas</li>
                    <li>Metas de economia e tags personalizadas</li>
                    <li>Modo viagem e calculadoras financeiras</li>
                    <li>Avisos sincronizados no site e no celular</li>
                  </ul>
                </div>
                <div className="pt-2 border-t border-border text-ink font-semibold">
                  Feito em Gravataí, RS · {SUPPORT_EMAIL}
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      </div>
    </PageContainer>
  );
}

export default Help;
