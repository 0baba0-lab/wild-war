using UnityEngine;
using Unity.Netcode;

[RequireComponent(typeof(NetworkManager))]
public class GameServerStarter : MonoBehaviour
{
    private void Start()
    {
#if UNITY_SERVER
        // 같은 오브젝트의 NetworkManager로 서버를 시작한다.
        NetworkManager manager = GetComponent<NetworkManager>();

        if (manager.StartServer())
        {
            Debug.Log("Unity 게임 서버 시작 성공");
        }
        else
        {
            Debug.LogError("Unity 게임 서버 시작 실패");
        }
#endif
    }
}