<#
.SYNOPSIS
  Cria as contas fictícias de teste do DocSync no locatário Entra ID de TESTE (decisão 0008).

.DESCRIPTION
  Cria três pessoas fictícias (Qualidade, Solicitante e Leitor) no domínio padrão do locatário
  em que você entrar. Cada conta recebe uma senha aleatória, exibida SÓ neste terminal, com troca
  obrigatória no primeiro login. Contas que já existem são mantidas (a senha não muda).

  Nunca rode no locatário da Monto. Nunca copie as senhas para o repositório, chat, ticket ou
  documentação (CLAUDE.md, seção 4).

  Depois de rodar, pré-cadastre as pessoas na tela Pessoas do DocSync com o perfil e a área
  sugeridos na tabela final.

.PARAMETER TenantId
  ID do locatário de TESTE (o mesmo do .env local).

.EXAMPLE
  .\scripts\entra\criar-contas-teste.ps1 -TenantId <id-do-locatario-de-teste>
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $TenantId
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Users)) {
  Write-Host 'Instalando o módulo Microsoft.Graph (só para o seu usuário)...'
  Install-Module Microsoft.Graph.Users, Microsoft.Graph.Identity.DirectoryManagement -Scope CurrentUser -Force
}
Import-Module Microsoft.Graph.Users
Import-Module Microsoft.Graph.Identity.DirectoryManagement

Connect-MgGraph -TenantId $TenantId -Scopes 'User.ReadWrite.All', 'Domain.Read.All' -NoWelcome

$dominio = (Get-MgDomain | Where-Object { $_.IsDefault }).Id
Write-Host ''
Write-Host "Locatário conectado. Domínio padrão: $dominio"
$resposta = Read-Host 'Confirme que este é o locatário de TESTE, e não o da Monto (digite SIM)'
if ($resposta -ne 'SIM') {
  Disconnect-MgGraph | Out-Null
  throw 'Cancelado: nada foi criado.'
}

function Nova-Senha {
  # 16 caracteres aleatórios (gerador criptográfico) + um de cada classe exigida pelo Entra.
  $alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  $bytes = New-Object byte[] 16
  $gerador = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $gerador.GetBytes($bytes)
  $corpo = -join ($bytes | ForEach-Object { $alfabeto[$_ % $alfabeto.Length] })
  return "$corpo" + 'Aa9!'
}

$contas = @(
  @{ Apelido = 'teste.qualidade';   Nome = 'Teste Qualidade';   Perfil = 'Qualidade';   Area = 'Qualidade' },
  @{ Apelido = 'teste.solicitante'; Nome = 'Teste Solicitante'; Perfil = 'Solicitante'; Area = 'Engenharia' },
  @{ Apelido = 'teste.leitor';      Nome = 'Teste Leitor';      Perfil = 'Leitor';      Area = 'Suprimentos' }
)

$resultado = foreach ($conta in $contas) {
  $upn = "$($conta.Apelido)@$dominio"
  $existente = Get-MgUser -Filter "userPrincipalName eq '$upn'" -ErrorAction SilentlyContinue
  if ($existente) {
    $exibir = '(já existia; senha não alterada)'
  } else {
    $inicial = Nova-Senha
    $perfilAcesso = @{ ForceChangePasswordNextSignIn = $true }
    $perfilAcesso.Add('Password', $inicial)
    New-MgUser -AccountEnabled `
      -DisplayName $conta.Nome `
      -MailNickname $conta.Apelido `
      -UserPrincipalName $upn `
      -UsageLocation 'BR' `
      -PasswordProfile $perfilAcesso | Out-Null
    $exibir = $inicial
  }
  [pscustomobject]@{
    'E-mail (login)'        = $upn
    'Senha inicial'         = $exibir
    'Perfil no DocSync'     = $conta.Perfil
    'Área no DocSync'       = $conta.Area
  }
}

Disconnect-MgGraph | Out-Null

Write-Host ''
Write-Host 'Contas de teste (anote as senhas num lugar seguro; elas não ficam gravadas em lugar nenhum):'
$resultado | Format-Table -AutoSize
Write-Host 'Próximo passo: no DocSync, tela Pessoas, pré-cadastre cada e-mail com o perfil e a área acima.'
Write-Host 'No primeiro login, cada conta pede a troca da senha. Use uma janela anônima por conta.'
