
Private ApiBase As String
Private SessionCookie As String
Private StateRevision As String
Private LastStatus As Long
Private LastError As String
Private CurrentPage As Long
Private PageCount As Long
Private InboxMode As Boolean
Private People As Collection
Private Requests As Collection

Private Sub Form_Load()
    On Error GoTo Failed
    Dim f As Integer
    f = FreeFile
    Open CurrentProject.Path & "\Sunucu_Adresi.txt" For Input As #f
    Line Input #f, ApiBase
    Close #f
    ApiBase = Trim$(ApiBase)
    If Right$(ApiBase, 1) = "/" Then ApiBase = Left$(ApiBase, Len(ApiBase) - 1)
    If Not ValidServer() Then Err.Raise 5, , "Sunucu adresi HTTPS veya yerel 127.0.0.1 olmali."
    Me.lblAddress.Caption = ApiBase
    ShowScreen "login"
    Me.txtStatus = "Sunucuda tanimli hesabinizla giris yapin."
    Exit Sub
Failed:
    Me.cmdLogin.Enabled = False
    Me.txtStatus = Err.Description
End Sub

Private Function ValidServer() As Boolean
    Dim re As Object
    Set re = CreateObject("VBScript.RegExp")
    re.Pattern = "^https://[a-z0-9.-]+(:[0-9]{1,5})?$|^http://127[.]0[.]0[.]1:[0-9]{1,5}$"
    re.IgnoreCase = True
    ValidServer = re.Test(ApiBase)
End Function

Private Sub ShowScreen(ByVal screen As String)
    Dim ctl As Control
    Me.cmdPortal.SetFocus
    For Each ctl In Me.Controls
        Select Case ctl.Tag
            Case "login", "work", "new": ctl.Visible = (ctl.Tag = screen)
            Case "signed": ctl.Visible = (screen <> "login")
        End Select
    Next ctl
    If screen = "login" Then Me.txtEmail.SetFocus
End Sub

Private Function Api(ByVal method As String, ByVal path As String, Optional ByVal body As String = "") As String
    On Error GoTo NetworkError
    Dim request As Object, rawCookie As String
    LastStatus = 0
    LastError = ""
    Set request = CreateObject("WinHttp.WinHttpRequest.5.1")
    request.SetTimeouts 4000, 4000, 7000, 15000
    request.Open method, ApiBase & path, False
    request.Option(6) = False
    request.SetRequestHeader "X-Destek-Access", "1"
    If Len(SessionCookie) > 0 Then request.SetRequestHeader "Cookie", SessionCookie
    If method = "POST" Then
        request.SetRequestHeader "Origin", ApiBase
        request.SetRequestHeader "Content-Type", "application/json"
        request.Send body
    Else
        request.Send
    End If
    LastStatus = request.Status
    Api = request.ResponseText
    If path = "/api/login" And LastStatus = 200 Then
        rawCookie = request.GetResponseHeader("Set-Cookie")
        SessionCookie = Split(rawCookie, ";")(0)
        If Left$(SessionCookie, 15) <> "destek_session=" Or Len(SessionCookie) <> 79 Then
            SessionCookie = ""
            LastStatus = 0
            LastError = "Sunucu oturum anahtari dondermedi."
        End If
    ElseIf LastStatus >= 400 Then
        LastError = Api
        If Left$(LastError, 6) = "ERROR" & vbTab Then LastError = Mid$(LastError, 7)
        If LastStatus = 401 And path <> "/api/login" Then
            SessionCookie = ""
            LastError = "Oturum sona erdi. Yeniden giris yapin."
            ShowScreen "login"
        End If
    End If
    Exit Function
NetworkError:
    LastStatus = 0
    LastError = "Sunucuya baglanilamadi. Adresi ve sunucunun calistigini kontrol edin."
End Function

Private Function J(ByVal value As String) As String
    Dim i As Long, code As Long, ch As String, result As String
    result = Chr$(34)
    For i = 1 To Len(value)
        ch = Mid$(value, i, 1)
        code = AscW(ch) And &HFFFF&
        Select Case code
            Case 34, 92: result = result & "\" & ch
            Case 0 To 31, 127 To 65535: result = result & "\u" & Right$("0000" & Hex$(code), 4)
            Case Else: result = result & ch
        End Select
    Next i
    J = result & Chr$(34)
End Function

Private Function Q(ByVal value As String) As String
    Q = Chr$(34) & Replace(value, Chr$(34), Chr$(34) & Chr$(34)) & Chr$(34)
End Function

Private Sub cmdLogin_Click()
    Dim ignored As String
    If Len(Trim$(Nz(Me.txtEmail, ""))) = 0 Or Len(Nz(Me.txtPassword, "")) = 0 Then
        Me.txtStatus = "E-posta ve parola gerekli."
        Exit Sub
    End If
    SessionCookie = ""
    ignored = Api("POST", "/api/login", "{""email"":" & J(Trim$(Nz(Me.txtEmail, ""))) & ",""password"":" & J(Nz(Me.txtPassword, "")) & "}")
    Me.txtPassword = Null
    If LastStatus <> 200 Then
        Me.txtStatus = LastError
        Exit Sub
    End If
    CurrentPage = 1
    InboxMode = False
    RefreshWork
End Sub

Private Sub RefreshWork()
    On Error GoTo Failed
    Dim body As String, view As String, row As Variant, a As Variant, role As String
    If InboxMode Then view = "inbox" Else view = "all"
    body = Api("GET", "/api/state?view=" & view & "&page=" & CStr(CurrentPage))
    If LastStatus <> 200 Then
        Me.txtStatus = LastError
        Exit Sub
    End If
    Set People = New Collection
    Set Requests = New Collection
    Me.lstRequests.RowSource = ""
    Me.cboFrom.Value = Null
    Me.cboTo.Value = Null
    Me.cboFrom.RowSource = ""
    Me.cboTo.RowSource = ""
    Me.lstPeople.RowSource = ""
    Me.txtDetails = Null
    Me.cmdApprove.Enabled = False
    Me.cmdReject.Enabled = False
    For Each row In Split(body, vbLf)
        a = Split(CStr(row), vbTab)
        Select Case a(0)
            Case "M"
                StateRevision = a(1)
                role = a(3)
                Me.lblUser.Caption = a(2) & " / " & RoleName(role)
                CurrentPage = CLng(a(4))
                PageCount = CLng(a(5))
                Me.lblPage.Caption = CurrentPage & " / " & PageCount & "  (" & a(6) & " kayit)"
            Case "D"
                Me.cboTo.AddItem Q(CStr(a(1))) & ";" & Q(CStr(a(2)))
                If a(3) = "1" Then Me.cboFrom.AddItem Q(CStr(a(1))) & ";" & Q(CStr(a(2)))
            Case "P": People.Add a
            Case "R"
                Requests.Add a
                Me.lstRequests.AddItem Q(CStr(a(2))) & ";" & Q(Left$(CStr(a(3)), 48)) & ";" & Q(Left$(CStr(a(4)), 48)) & ";" & Q(Replace(CStr(a(5)), "T", " ")) & ";" & Q(StatusName(CStr(a(7))))
        End Select
    Next row
    If Len(role) = 0 Then GoTo Failed
    ShowScreen "work"
    Me.cmdNew.Enabled = (role = "manager" Or role = "admin") And Me.cboFrom.ListCount > 0 And Me.cboTo.ListCount > 1
    Me.cmdPrev.Enabled = CurrentPage > 1
    Me.cmdNext.Enabled = CurrentPage < PageCount
    Me.cmdView.Caption = IIf(InboxMode, "Tum kayitlar", "Onay kutusu")
    Me.txtStatus = IIf(InboxMode, "Onaylayabileceginiz bekleyen kayitlar.", "Yetkiniz dahilindeki destek kayitlari.")
    Exit Sub
Failed:
    Me.txtStatus = "Sunucu yaniti okunamadi. Access paketindeki sunucuyu kullanin."
End Sub

Private Function RoleName(ByVal role As String) As String
    Select Case role
        Case "admin": RoleName = "Yonetici"
        Case "manager": RoleName = "Bolum yetkilisi"
        Case Else: RoleName = "Denetci"
    End Select
End Function

Private Function StatusName(ByVal state As String) As String
    Select Case state
        Case "pending": StatusName = "Onay bekliyor"
        Case "approved": StatusName = "Onaylandi"
        Case "rejected": StatusName = "Reddedildi"
        Case "cancelled": StatusName = "Iptal edildi"
        Case Else: StatusName = state
    End Select
End Function

Private Sub lstRequests_AfterUpdate()
    Dim a As Variant
    If Me.lstRequests.ListIndex < 0 Then Exit Sub
    a = Requests(Me.lstRequests.ListIndex + 1)
    Me.txtDetails = a(2) & " | " & StatusName(CStr(a(7))) & vbCrLf & _
        a(3) & " > " & a(4) & vbCrLf & Replace(a(5), "T", " ") & " - " & Replace(a(6), "T", " ") & vbCrLf & _
        "Mola: " & a(13) & " dk | " & IIf(a(12) = "1", "Gerceklesen", "Planlanan") & vbCrLf & _
        "Personel: " & a(11) & vbCrLf & "Not: " & a(9) & vbCrLf & "Karar gerekcesi: " & a(10)
    Me.cmdApprove.Enabled = (a(8) = "1")
    Me.cmdReject.Enabled = (a(8) = "1")
End Sub

Private Sub cmdView_Click()
    InboxMode = Not InboxMode
    CurrentPage = 1
    RefreshWork
End Sub
Private Sub cmdRefresh_Click()
    RefreshWork
End Sub
Private Sub cmdPrev_Click()
    If CurrentPage > 1 Then CurrentPage = CurrentPage - 1
    RefreshWork
End Sub
Private Sub cmdNext_Click()
    If CurrentPage < PageCount Then CurrentPage = CurrentPage + 1
    RefreshWork
End Sub
Private Sub cmdApprove_Click()
    Decide "approved"
End Sub
Private Sub cmdReject_Click()
    Decide "rejected"
End Sub

Private Sub Decide(ByVal decision As String)
    Dim a As Variant, reason As String
    If Me.lstRequests.ListIndex < 0 Then Exit Sub
    a = Requests(Me.lstRequests.ListIndex + 1)
    If a(8) <> "1" Then Exit Sub
    reason = Trim$(Nz(Me.txtReason, ""))
    If decision = "rejected" And Len(reason) = 0 Then
        Me.txtStatus = "Ret gerekcesi zorunlu."
        Me.txtReason.SetFocus
        Exit Sub
    End If
    If WriteAction("decision", "{""id"":" & J(CStr(a(1))) & ",""status"":" & J(decision) & ",""reason"":" & J(reason) & "}") Then
        Me.txtReason = Null
        RefreshWork
        If LastStatus = 200 Then Me.txtStatus = "Karar kaydedildi."
    End If
End Sub

Private Function WriteAction(ByVal action As String, ByVal details As String) As Boolean
    Dim ignored As String
    ignored = Api("POST", "/api/state", "{""revision"":" & StateRevision & ",""action"":" & J(action) & ",""payload"":" & details & "}")
    WriteAction = (LastStatus = 200)
    If Not WriteAction Then Me.txtStatus = LastError
End Function

Private Sub cmdNew_Click()
    Me.cboFrom.Value = Null
    Me.cboTo.Value = Null
    Me.lstPeople.RowSource = ""
    Me.txtStart = Format$(Date, "yyyy-mm-dd") & " 09:00"
    Me.txtEnd = Format$(Date, "yyyy-mm-dd") & " 12:00"
    Me.txtBreak = 0
    Me.chkRealized = False
    Me.txtNote = Null
    ShowScreen "new"
    Me.cboFrom.SetFocus
    Me.txtStatus = "Bolum, personel ve sureyi secin."
End Sub

Private Sub cboFrom_AfterUpdate()
    Dim a As Variant
    Me.lstPeople.RowSource = ""
    For Each a In People
        If a(2) = Nz(Me.cboFrom.Value, "") Then Me.lstPeople.AddItem Q(CStr(a(1))) & ";" & Q(CStr(a(3)))
    Next a
End Sub

Private Sub cmdCancel_Click()
    RefreshWork
End Sub

Private Sub cmdSave_Click()
    Dim ids As String, item As Variant, body As String, startAt As String, endAt As String
    Dim fromDept As String, toDept As String, minutes As String, realized As String
    fromDept = Nz(Me.cboFrom.Value, "")
    toDept = Nz(Me.cboTo.Value, "")
    If Len(fromDept) = 0 Or Len(toDept) = 0 Or fromDept = toDept Then
        Me.txtStatus = "Iki farkli bolum secin."
        Exit Sub
    End If
    For Each item In Me.lstPeople.ItemsSelected
        If Len(ids) > 0 Then ids = ids & ","
        ids = ids & J(CStr(Me.lstPeople.ItemData(item)))
    Next item
    If Len(ids) = 0 Then
        Me.txtStatus = "En az bir personel secin."
        Exit Sub
    End If
    minutes = Trim$(Nz(Me.txtBreak, ""))
    If Len(minutes) = 0 Or Len(minutes) > 4 Or minutes Like "*[!0-9]*" Then
        Me.txtStatus = "Mola icin dakika cinsinden tam sayi girin."
        Exit Sub
    End If
    startAt = Replace(Trim$(Nz(Me.txtStart, "")), " ", "T")
    endAt = Replace(Trim$(Nz(Me.txtEnd, "")), " ", "T")
    If Not (startAt Like "####-##-##T##:##") Or Not (endAt Like "####-##-##T##:##") Then
        Me.txtStatus = "Tarih bicimi YYYY-AA-GG SS:DD olmali."
        Exit Sub
    End If
    realized = IIf(Nz(Me.chkRealized, False), "true", "false")
    body = "{""fromDept"":" & J(fromDept) & ",""toDept"":" & J(toDept) & ",""personIds"":[" & ids & _
        "],""start"":" & J(startAt) & ",""end"":" & J(endAt) & ",""breakMinutes"":" & CStr(CLng(minutes)) & _
        ",""realized"":" & realized & ",""note"":" & J(Left$(Nz(Me.txtNote, ""), 1000)) & "}"
    If WriteAction("support", body) Then
        CurrentPage = 1
        InboxMode = False
        RefreshWork
        If LastStatus = 200 Then Me.txtStatus = "Destek kaydi olusturuldu."
    End If
End Sub

Private Sub cmdPortal_Click()
    If ValidServer() Then Application.FollowHyperlink ApiBase
End Sub

Private Sub cmdLogout_Click()
    Dim ignored As String
    If Len(SessionCookie) > 0 Then ignored = Api("POST", "/api/logout", "{}")
    SessionCookie = ""
    Me.txtPassword = Null
    Me.lstRequests.RowSource = ""
    Me.txtDetails = Null
    Me.txtReason = Null
    Me.txtNote = Null
    Me.lblUser.Caption = ""
    Set People = Nothing
    Set Requests = Nothing
    ShowScreen "login"
    Me.txtStatus = "Oturum kapatildi."
End Sub

Private Sub Form_Unload(Cancel As Integer)
    Dim ignored As String
    If Len(SessionCookie) > 0 Then ignored = Api("POST", "/api/logout", "{}")
    SessionCookie = ""
End Sub
