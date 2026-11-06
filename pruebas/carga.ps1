# Prueba de carga mínima para Windows PowerShell.
# Uso:  .\pruebas\carga.ps1 -Total 30
param([int]$Total = 30, [string]$Url = "http://localhost:8080/whoami")
Write-Host "Enviando $Total peticiones a $Url ..."
$res = 1..$Total | ForEach-Object {
  try { (Invoke-RestMethod -Uri "$Url`?i=$_" -TimeoutSec 5).nodo } catch { "FALLO" }
}
$res | Group-Object | Sort-Object Name | ForEach-Object {
  "{0,-8} {1,4}  {2}" -f $_.Name, $_.Count, ("█" * $_.Count)
}
