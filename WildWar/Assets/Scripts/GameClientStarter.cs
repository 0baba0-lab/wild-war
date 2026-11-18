using UnityEngine;
using Unity.Netcode;
using Unity.Netcode.Transports.UTP;

[RequireComponent(typeof(NetworkManager), typeof(UnityTransport))]
public class GameClientStarter : MonoBehaviour
{
    private NetworkManager manager;

    private void Start()
    {
        if (Application.platform != RuntimePlatform.WebGLPlayer)
        {
            return;
        }

        // 게임을 연 웹사이트의 /unity/ 경로로 접속한다.
        var page = new System.Uri(Application.absoluteURL);
        UnityTransport transport = GetComponent<UnityTransport>();

        transport.UseWebSockets = true;
        transport.UseEncryption = page.Scheme == "https";
        transport.SetConnectionData(page.Host, (ushort)page.Port);
        transport.ConnectionData.WebSocketPath = "/unity/";

        if (transport.UseEncryption)
        {
            transport.SetClientSecrets(page.Host);
        }

        manager = GetComponent<NetworkManager>();
        manager.OnClientConnectedCallback += OnConnected;

        if (!manager.StartClient())
        {
            Debug.LogError("게임 서버 접속 시작 실패");
        }
    }

    private void OnConnected(ulong clientId)
    {
        if (clientId == manager.LocalClientId)
        {
            Debug.Log("게임 서버 접속 성공");
        }
    }

    private void OnDestroy()
    {
        if (manager != null)
        {
            manager.OnClientConnectedCallback -= OnConnected;
        }
    }
}