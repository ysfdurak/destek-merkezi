$ErrorActionPreference = 'Stop'
$directory = $PSScriptRoot
$database = Join-Path $directory 'Destek_Merkezi.accdb'
$temporary = Join-Path $directory ('Destek_Kurulum_' + [Guid]::NewGuid().ToString('N') + '.accdb')
$access = $null
$stage = 'access'

function Release-Com {
    param($object)
    if ($null -ne $object) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($object) } catch {} }
}

function Add-Control {
    param([string]$Name,[int]$Type,[int[]]$Box,[string]$Group,[string]$Caption,[hashtable]$Options = @{})
    $control = $access.CreateControl($form.Name, $Type, 0, '', '', $Box[0], $Box[1], $Box[2], $Box[3])
    $control.Name = $Name
    $control.Tag = $Group
    $control.Visible = ($Group -eq '' -or $Group -eq 'login')
    if ($Type -eq 100 -or $Type -eq 104) { $control.Caption = $Caption }
    if ($Type -ne 106) {
        $control.FontName = 'Segoe UI'
        $control.FontSize = 10
    }
    foreach ($property in $Options.Keys) { $control.$property = $Options[$property] }
    Release-Com $control
}

try {
    if (Test-Path -LiteralPath $database) { Start-Process -FilePath $database; exit 0 }
    $access = New-Object -ComObject Access.Application
    $stage = 'form'
    $access.NewCurrentDatabase($temporary, 12)
    $form = $access.CreateForm()
    $tempName = $form.Name
    $form.Caption = 'Destek Merkezi | Microsoft Access'
    $form.Width = 11300
    $form.Section(0).Height = 8150
    $form.Section(0).BackColor = 16185074
    $form.RecordSelectors = $false
    $form.NavigationButtons = $false
    $form.DividingLines = $false
    $form.AutoCenter = $true
    $form.ScrollBars = 2
    $form.DefaultView = 0
    $form.OnLoad = '[Event Procedure]'
    $form.OnUnload = '[Event Procedure]'

    $click = @{OnClick='[Event Procedure]'}
    $change = @{AfterUpdate='[Event Procedure]'}
    $combo = @{RowSourceType='Value List';ColumnCount=2;BoundColumn=1;ColumnWidths='0;3200';LimitToList=$true}
    Add-Control 'lblTitle' 100 @(360,250,6800,510) '' 'Destek Merkezi' @{FontSize=22;FontWeight=700;ForeColor=5711879}
    Add-Control 'lblAddress' 100 @(390,805,6800,320) '' '' @{ForeColor=5987160}
    Add-Control 'cmdPortal' 104 @(8570,320,2270,490) '' 'Yönetim portalı' $click
    Add-Control 'lblUser' 100 @(360,1210,7500,370) 'signed' '' @{FontWeight=700}
    Add-Control 'cmdLogout' 104 @(9280,1140,1560,430) 'signed' 'Oturumu kapat' $click
    Add-Control 'txtStatus' 109 @(360,7420,10480,500) '' '' @{Locked=$true;TabStop=$false}

    Add-Control 'lblLoginTitle' 100 @(360,1680,8400,460) 'login' 'Kullanıcı girişi' @{FontSize=15;FontWeight=700}
    Add-Control 'lblEmail' 100 @(360,2390,5500,350) 'login' 'E-posta adresi'
    Add-Control 'txtEmail' 109 @(360,2760,5450,480) 'login' ''
    Add-Control 'lblPassword' 100 @(360,3500,5500,350) 'login' 'Parola'
    Add-Control 'txtPassword' 109 @(360,3870,5450,480) 'login' '' @{InputMask='Password'}
    Add-Control 'cmdLogin' 104 @(360,4680,2200,530) 'login' 'Giriş yap' @{OnClick='[Event Procedure]';Default=$true}
    Add-Control 'lblLoginHelp' 100 @(360,5450,10100,600) 'login' 'İlk yönetici hesabı ve bölüm yetkilileri yönetim portalında oluşturulur.' @{ForeColor=5987160}

    Add-Control 'cmdView' 104 @(360,1700,1950,430) 'work' 'Onay kutusu' $click
    Add-Control 'cmdRefresh' 104 @(2440,1700,1370,430) 'work' 'Yenile' $click
    Add-Control 'cmdNew' 104 @(3950,1700,1950,430) 'work' 'Yeni destek' $click
    Add-Control 'cmdPrev' 104 @(7270,1700,830,430) 'work' 'Önceki' $click
    Add-Control 'lblPage' 100 @(8160,1770,1630,330) 'work' ''
    Add-Control 'cmdNext' 104 @(9850,1700,990,430) 'work' 'Sonraki' $click
    Add-Control 'lblColumns' 100 @(375,2210,10400,300) 'work' 'Kayıt kodu          Destek veren                   Destek yapılan                 Başlangıç                     Durum'
    Add-Control 'lstRequests' 110 @(360,2560,10480,2080) 'work' '' @{RowSourceType='Value List';ColumnCount=5;BoundColumn=1;ColumnWidths='1450;2350;2350;2200;1950';AfterUpdate='[Event Procedure]'}
    Add-Control 'txtDetails' 109 @(360,4750,10480,1450) 'work' '' @{Locked=$true;ScrollBars=2;EnterKeyBehavior=$true}
    Add-Control 'lblReason' 100 @(360,6380,4800,310) 'work' 'Ret gerekçesi'
    Add-Control 'txtReason' 109 @(360,6740,5920,420) 'work' ''
    Add-Control 'cmdApprove' 104 @(6460,6740,2100,420) 'work' 'Onayla' $click
    Add-Control 'cmdReject' 104 @(8730,6740,2110,420) 'work' 'Reddet' $click

    Add-Control 'lblFrom' 100 @(360,1770,4700,330) 'new' 'Destek veren bölüm'
    Add-Control 'lblTo' 100 @(5660,1770,4700,330) 'new' 'Destek yapılan bölüm'
    Add-Control 'cboFrom' 111 @(360,2130,4960,420) 'new' '' ($combo + $change)
    Add-Control 'cboTo' 111 @(5660,2130,5180,420) 'new' '' $combo
    Add-Control 'lblPeople' 100 @(360,2710,5000,330) 'new' 'Destek veren personel (çoklu seçim)'
    Add-Control 'lstPeople' 110 @(360,3090,4960,1700) 'new' '' @{RowSourceType='Value List';ColumnCount=2;BoundColumn=1;ColumnWidths='0;4200';MultiSelect=1}
    Add-Control 'lblStart' 100 @(5660,2720,4900,320) 'new' 'Başlangıç (YYYY-AA-GG SS:DD)'
    Add-Control 'txtStart' 109 @(5660,3090,5180,420) 'new' ''
    Add-Control 'lblEnd' 100 @(5660,3670,4900,320) 'new' 'Bitiş (Türkiye saati)'
    Add-Control 'txtEnd' 109 @(5660,4040,5180,420) 'new' ''
    Add-Control 'lblBreak' 100 @(5660,4580,2800,320) 'new' 'Mola (dakika)'
    Add-Control 'txtBreak' 109 @(5660,4940,1870,400) 'new' ''
    Add-Control 'chkRealized' 106 @(7840,4960,260,260) 'new' ''
    Add-Control 'lblRealized' 100 @(8220,4950,2500,320) 'new' 'Gerçekleşen destek'
    Add-Control 'lblNote' 100 @(360,4930,4900,310) 'new' 'Açıklama'
    Add-Control 'txtNote' 109 @(360,5310,10480,930) 'new' '' @{EnterKeyBehavior=$true;ScrollBars=2}
    Add-Control 'cmdSave' 104 @(6380,6530,2600,510) 'new' 'Onaya gönder' $click
    Add-Control 'cmdCancel' 104 @(9140,6530,1700,510) 'new' 'Vazgeç' $click

    $form.HasModule = $true
    $code = [IO.File]::ReadAllText((Join-Path $directory 'Access_Form.vba'))
    $module = $form.Module
    $module.InsertLines($module.CountOfLines + 1, $code)
    $access.DoCmd.Close(2, $tempName, 1)
    $access.DoCmd.Rename('frmDestekMerkezi', 2, $tempName)
    $db = $access.CurrentDb()
    try { $db.Properties('StartupForm').Value = 'frmDestekMerkezi' }
    catch { $db.Properties.Append($db.CreateProperty('StartupForm', 10, 'frmDestekMerkezi')) }
    # COM nesneleri bırakılmazsa Access kapandıktan sonra da .accdb kilitli kalır.
    Release-Com $db; $db = $null
    Release-Com $module; $module = $null
    Release-Com $form; $form = $null
    $access.CloseCurrentDatabase()
    $access.Quit(2)
    Release-Com $access; $access = $null
    [GC]::Collect(); [GC]::WaitForPendingFinalizers(); [GC]::Collect()
    $stage = 'move'
    # Access süreci dosyayı birkaç saniye daha tutabilir; 15 saniye boyunca yeniden denenir.
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        try { Move-Item -LiteralPath $temporary -Destination $database -ErrorAction Stop; break }
        catch { if ($attempt -eq 30) { throw } ; Start-Sleep -Milliseconds 500 }
    }
    Write-Host "Oluşturuldu: $database"
    Start-Process -FilePath $database
} catch {
    switch ($stage) {
        'access' { Write-Host "Microsoft Access başlatılamadı. Tam Access masaüstü sürümü gerekir (Access Runtime form oluşturamaz)." }
        'form'   { Write-Host "Access form oluşturulurken durdu. VBA projesine erişim veya kod çalıştırma izni kapalı olabilir; BT onaylı ayarları kontrol edin." }
        'move'   { Write-Host "Form oluşturuldu ama dosya hâlâ kilitli: Access kapanmayı bitirmedi. Birkaç saniye bekleyip Baslat_Access.cmd dosyasını yeniden açın; açık Access penceresi varsa kapatın." }
    }
    Write-Host ("Ayrıntı: " + $_.Exception.Message)
    exit 1
} finally {
    if ($null -ne $access) { try { $access.Quit(2) } catch {}; Release-Com $access; $access = $null }
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -ErrorAction SilentlyContinue }
}
